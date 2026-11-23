// Optimized CUDA ray tracer: binary BVH, precomputed edges, one-thread-per-sample.
#define PAR_DEPTH 8
#include "bvh.hpp"
#include <cuda_runtime.h>
#include <cstdio>
#include <cstdlib>

struct N32 { float lo[3], hi[3]; int a, b; }; // leaf b<0 (a=start,count=-b); internal a=left|axis<<29,b=right

static float4* d_geom = nullptr;
static float4* d_shade = nullptr;
static N32*    d_nodes = nullptr;
static float*  d_samples = nullptr;
static float4* h_geom = nullptr;
static float4* h_shade = nullptr;
static N32*    h_nodes = nullptr;
static int cap_tri = 0, cap_nodes = 0;

static void ck(cudaError_t e){ if(e!=cudaSuccess){ fprintf(stderr,"solution: %s\n",cudaGetErrorString(e)); exit(2);} }

__device__ __forceinline__ V<float> v4(const float4& f){ return V<float>(f.x,f.y,f.z); }
__device__ __forceinline__ V<float> safe_inv(const V<float>& d){
    return V<float>(
        fabsf(d.x)>1e-30f ? 1.0f/d.x : copysignf(1e30f,d.x),
        fabsf(d.y)>1e-30f ? 1.0f/d.y : copysignf(1e30f,d.y),
        fabsf(d.z)>1e-30f ? 1.0f/d.z : copysignf(1e30f,d.z));
}
__device__ __forceinline__ bool boxTest(const N32& n, const V<float>& o, const V<float>& invd, float tmin, float& near){
    float a=0.0002f, b=tmin;
    float t1=(n.lo[0]-1e-5f-o.x)*invd.x, t2=(n.hi[0]+1e-5f-o.x)*invd.x;
    if(t1>t2){float z=t1;t1=t2;t2=z;}
    a=fmaxf(a,t1); b=fminf(b,t2); if(a>b) return false;
    t1=(n.lo[1]-1e-5f-o.y)*invd.y; t2=(n.hi[1]+1e-5f-o.y)*invd.y;
    if(t1>t2){float z=t1;t1=t2;t2=z;}
    a=fmaxf(a,t1); b=fminf(b,t2); if(a>b) return false;
    t1=(n.lo[2]-1e-5f-o.z)*invd.z; t2=(n.hi[2]+1e-5f-o.z)*invd.z;
    if(t1>t2){float z=t1;t1=t2;t2=z;}
    a=fmaxf(a,t1); b=fminf(b,t2); if(a>b) return false;
    near=a; return true;
}

struct Query {
    const float4* __restrict__ geom;
    const float4* __restrict__ shade;
    const N32*    __restrict__ nodes;
    __device__ __forceinline__ bool tri(int id, const Ray<float>& r, float limit, float& dist) const {
        V<float> a=v4(__ldg(&geom[3*id+0]));
        V<float> e1=v4(__ldg(&geom[3*id+1]));
        V<float> e2=v4(__ldg(&geom[3*id+2]));
        V<float> p=r.d.cross(e2); float det=e1.dot(p);
        if(fabsf(det)<1e-10f) return false;
        float inv=1.0f/det; V<float> s=r.o-a; float u=s.dot(p)*inv;
        if(u<0.0f||u>1.0f) return false;
        V<float> q=s.cross(e1); float v=r.d.dot(q)*inv;
        if(v<0.0f||u+v>1.0f) return false;
        float d=e2.dot(q)*inv;
        if(d<=0.0002f||d>=limit) return false;
        dist=d; return true;
    }
    __device__ Hit<float> trace(const Ray<float>& r, float limit, bool any) const {
        float tmin=limit; int hitid=-1;
        V<float> o=r.o, invd=safe_inv(r.d);
        int stack[64]; int sp=0;
        { float nr; if(!boxTest(nodes[0],o,invd,tmin,nr)) return Hit<float>{tmin,hitid}; }
        stack[sp++]=0;
        while(sp){
            const N32 n=nodes[stack[--sp]];
            if(n.b<0){
                int start=n.a, cnt=-n.b;
                for(int i=0;i<cnt;i++){
                    int id=start+i; float dist;
                    if(tri(id,r,tmin,dist)){ tmin=dist; hitid=id; if(any) return Hit<float>{tmin,hitid}; }
                }
            } else {
                int left=n.a&0x1FFFFFFF; int right=n.b;
                const N32 L=nodes[left]; const N32 R=nodes[right];
                float nL,nR;
                bool hL=boxTest(L,o,invd,tmin,nL);
                bool hR=boxTest(R,o,invd,tmin,nR);
                if(hL&&hR){ if(nL<nR){ stack[sp++]=right; stack[sp++]=left; } else { stack[sp++]=left; stack[sp++]=right; } }
                else if(hL) stack[sp++]=left;
                else if(hR) stack[sp++]=right;
            }
        }
        return Hit<float>{tmin,hitid};
    }
    __device__ __forceinline__ Hit<float> closest(const Ray<float>& r,float limit) const { return trace(r,limit,false); }
    __device__ __forceinline__ bool blocked(const Ray<float>& r,float limit) const { return trace(r,limit,true).id>=0; }
};

__device__ V<float> radiance_opt(const Scene& s, int pixel, int sid, const Query& q){
    Ray<float> r=camera<float>(s,pixel,sid);
    V<float> result, through(1,1,1);
    V<float> l=V<float>(s.light).unit();
    for(int depth=0;depth<s.max_depth;depth++){
        Hit<float> hit=q.closest(r,1e20f);
        if(hit.id<0){ result=result+through*sky(r.d); break; }
        V<float> e1=v4(__ldg(&q.geom[3*hit.id+1]));
        V<float> e2=v4(__ldg(&q.geom[3*hit.id+2]));
        V<float> n=e1.cross(e2).unit();
        if(n.dot(r.d)>0) n=n*(-1.0f);
        V<float> p=r.o+r.d*hit.t+n*0.001f;
        float cosine=n.dot(l); if(cosine<0)cosine=0;
        float visible=(cosine>0 && !q.blocked(Ray<float>{p,l},1e20f))?1.0f:0.0f;
        int open=0;
        V<float> axis=fabsf(n.z)<0.8f?V<float>(0,0,1):V<float>(0,1,0);
        V<float> tx=axis.cross(n).unit(), ty=n.cross(tx);
        for(int a=0;a<s.ao;a++){
            uint32_t key=s.seed+uint32_t(pixel)*0x9e3779b9u+uint32_t(sid)*0x85ebca6bu+uint32_t(depth)*0xc2b2ae35u+uint32_t(a)*0x27d4eb2du;
            float x=2.0f*sample<float>(key^0x68bc21ebu)-1.0f, y=2.0f*sample<float>(key^0x02e5be93u)-1.0f;
            float z=0.25f+0.75f*sample<float>(key^0x967a889bu);
            V<float> dir=(tx*x+ty*y+n*z).unit();
            open+=!q.blocked(Ray<float>{p,dir},s.ao_radius);
        }
        float ambient=s.ao?float(open)/float(s.ao):1.0f;
        float value=0.08f+0.20f*ambient+0.72f*cosine*visible;
        float4 sh=__ldg(&q.shade[hit.id]);
        V<float> color(sh.x,sh.y,sh.z); float mirror=sh.w;
        result=result+through*color*(value*(1.0f-mirror));
        through=through*mirror;
        if(mirror==0.0f) break;
        r=Ray<float>{p,(r.d-n*(2.0f*r.d.dot(n))).unit()};
    }
    return result;
}

__global__ void __launch_bounds__(128,8) trace_kernel(Scene s, const float4* __restrict__ geom, const float4* __restrict__ shade,
                             const N32* __restrict__ nodes, float* __restrict__ buf, int offset, int end){
    int i=offset+blockIdx.x*blockDim.x+threadIdx.x; if(i>=end) return;
    Query q{geom,shade,nodes};
    V<float> c=radiance_opt(s,i/s.spp,i%s.spp,q);
    buf[3*size_t(i)+0]=c.x; buf[3*size_t(i)+1]=c.y; buf[3*size_t(i)+2]=c.z;
}
__global__ void average_kernel(Scene s, const float* __restrict__ buf, float* __restrict__ out){
    int p=blockIdx.x*blockDim.x+threadIdx.x; if(p>=s.width*s.height) return;
    float inv=1.0f/float(s.spp);
    for(int k=0;k<3;k++){
        float sum=0;
        for(int j=0;j<s.spp;j++) sum+=buf[3*(size_t(p)*s.spp+j)+k];
        out[3*size_t(p)+k]=sum*inv;
    }
}

// Custom parallel binned-SAH builder (tunable bins/leaf).
#define MBINS 16
#define MLEAF 16
struct MyBuilder {
    const Triangle* T; int N;
    std::vector<float> lo,hi,cen;
    std::vector<int> order;
    std::vector<Node> nodes;
    std::atomic<int> next;
    explicit MyBuilder(const Scene& s):T(s.triangles),N(s.triangle_count){
        lo.resize(3*size_t(N));hi.resize(3*size_t(N));cen.resize(3*size_t(N));order.resize(N);
        for(int i=0;i<N;i++){const Triangle& t=T[i];
            for(int k=0;k<3;k++){float a=t.v0[k],b=t.v1[k],c=t.v2[k];
                lo[3*i+k]=std::min(a,std::min(b,c));hi[3*i+k]=std::max(a,std::max(b,c));cen[3*i+k]=(lo[3*i+k]+hi[3*i+k])*.5f;}
            order[i]=i;}
        nodes.resize(2*size_t(N)+1);next=0;build(0,N,0);nodes.resize(next.load());
    }
    static float area(const float* a,const float* b){float x=b[0]-a[0],y=b[1]-a[1],z=b[2]-a[2];return x*y+y*z+z*x;}
    int build(int b,int e,int depth){
        Node n{};float clo[3],chi[3];
        for(int k=0;k<3;k++){n.lo[k]=clo[k]=1e30f;n.hi[k]=chi[k]=-1e30f;}
        for(int i=b;i<e;i++){int t=order[i];for(int k=0;k<3;k++){
            n.lo[k]=std::min(n.lo[k],lo[3*t+k]);n.hi[k]=std::max(n.hi[k],hi[3*t+k]);
            clo[k]=std::min(clo[k],cen[3*t+k]);chi[k]=std::max(chi[k],cen[3*t+k]);}}
        n.start=b;n.count=e-b;n.left=n.right=-1;
        int id=next++;nodes[id]=n;
        int cnt=e-b;if(cnt<=2||depth>=60)return id;
        float best=1e30f;int bestAxis=-1,bestBin=0;
        for(int k=0;k<3;k++){
            float ext=chi[k]-clo[k];if(ext<1e-9f)continue;
            int bc[MBINS]={};float blo[MBINS][3],bhi[MBINS][3];
            for(int j=0;j<MBINS;j++)for(int q=0;q<3;q++){blo[j][q]=1e30f;bhi[j][q]=-1e30f;}
            float scale=MBINS/ext*(1-1e-6f);
            for(int i=b;i<e;i++){int t=order[i];int j=std::min(MBINS-1,int((cen[3*t+k]-clo[k])*scale));
                bc[j]++;for(int q=0;q<3;q++){blo[j][q]=std::min(blo[j][q],lo[3*t+q]);bhi[j][q]=std::max(bhi[j][q],hi[3*t+q]);}}
            float rarea[MBINS];int rcnt[MBINS];float alo[3]={1e30f,1e30f,1e30f},ahi[3]={-1e30f,-1e30f,-1e30f};int ac=0;
            for(int j=MBINS-1;j>0;j--){ac+=bc[j];for(int q=0;q<3;q++){alo[q]=std::min(alo[q],blo[j][q]);ahi[q]=std::max(ahi[q],bhi[j][q]);}
                rcnt[j]=ac;rarea[j]=ac?area(alo,ahi):0;}
            for(int q=0;q<3;q++){alo[q]=1e30f;ahi[q]=-1e30f;}ac=0;
            for(int j=1;j<MBINS;j++){ac+=bc[j-1];for(int q=0;q<3;q++){alo[q]=std::min(alo[q],blo[j-1][q]);ahi[q]=std::max(ahi[q],bhi[j-1][q]);}
                if(!ac||!rcnt[j])continue;float c=area(alo,ahi)*ac+rarea[j]*rcnt[j];
                if(c<best){best=c;bestAxis=k;bestBin=j;}}
        }
        float parentArea=area(n.lo,n.hi);
        float splitCost=1.0f+(parentArea>0?best/parentArea:float(cnt));
        if(cnt<=MLEAF&&float(cnt)<=splitCost)return id;
        int mid=-1;
        if(bestAxis>=0){
            int k=bestAxis;float ext=chi[k]-clo[k],scale=MBINS/ext*(1-1e-6f),c0=clo[k];
            mid=int(std::partition(order.begin()+b,order.begin()+e,[&](int t){return std::min(MBINS-1,int((cen[3*t+k]-c0)*scale))<bestBin;})-order.begin());
        }
        if(mid<=b||mid>=e){
            if(cnt<=2*MLEAF)return id;
            int axis=0;for(int k=1;k<3;k++)if(chi[k]-clo[k]>chi[axis]-clo[axis])axis=k;
            mid=(b+e)/2;std::nth_element(order.begin()+b,order.begin()+mid,order.begin()+e,[&](int x,int y){return cen[3*x+axis]<cen[3*y+axis];});
        }
        int l,r;
        if(depth<6&&cnt>2048){std::thread th([&]{l=build(b,mid,depth+1);});r=build(mid,e,depth+1);th.join();}
        else{l=build(b,mid,depth+1);r=build(mid,e,depth+1);}
        nodes[id].left=l;nodes[id].right=r;nodes[id].count=0;return id;
    }
};

void init(int max_triangles, int max_pixels, int max_samples){
    cap_tri=max_triangles; cap_nodes=2*max_triangles+1;
    ck(cudaMalloc(&d_geom, size_t(3)*cap_tri*sizeof(float4)));
    ck(cudaMalloc(&d_shade, size_t(cap_tri)*sizeof(float4)));
    ck(cudaMalloc(&d_nodes, size_t(cap_nodes)*sizeof(N32)));
    ck(cudaMalloc(&d_samples, size_t(max_pixels)*max_samples*3*sizeof(float)));
    ck(cudaMallocHost(&h_geom, size_t(3)*cap_tri*sizeof(float4)));
    ck(cudaMallocHost(&h_shade, size_t(cap_tri)*sizeof(float4)));
    ck(cudaMallocHost(&h_nodes, size_t(cap_nodes)*sizeof(N32)));
}

void render(const Scene& s, float* device_rgb){
    MyBuilder tree(s);
    int N=s.triangle_count;
    for(int j=0;j<N;j++){
        int id=tree.order[j]; const Triangle& t=s.triangles[id];
        float e1[3],e2[3];
        for(int k=0;k<3;k++){ e1[k]=t.v1[k]-t.v0[k]; e2[k]=t.v2[k]-t.v0[k]; }
        h_geom[3*j+0]=make_float4(t.v0[0],t.v0[1],t.v0[2],0);
        h_geom[3*j+1]=make_float4(e1[0],e1[1],e1[2],0);
        h_geom[3*j+2]=make_float4(e2[0],e2[1],e2[2],0);
        h_shade[j]=make_float4(t.color[0],t.color[1],t.color[2],t.mirror);
    }
    int nn=(int)tree.nodes.size();
    for(int i=0;i<nn;i++){
        const Node& src=tree.nodes[i]; N32& dst=h_nodes[i];
        dst.lo[0]=src.lo[0];dst.lo[1]=src.lo[1];dst.lo[2]=src.lo[2];
        dst.hi[0]=src.hi[0];dst.hi[1]=src.hi[1];dst.hi[2]=src.hi[2];
        if(src.count>0){ dst.a=src.start; dst.b=-src.count; }
        else {
            const Node& L=tree.nodes[src.left]; const Node& R=tree.nodes[src.right];
            int axis=0; float best=-1e30f;
            for(int k=0;k<3;k++){
                float cl=(L.lo[k]+L.hi[k])*0.5f, cr=(R.lo[k]+R.hi[k])*0.5f;
                float d=fabsf(cl-cr); if(d>best){best=d;axis=k;}
            }
            dst.a=src.left|(axis<<29); dst.b=src.right;
        }
    }
    ck(cudaMemcpyAsync(d_geom,h_geom,size_t(3)*N*sizeof(float4),cudaMemcpyHostToDevice,0));
    ck(cudaMemcpyAsync(d_shade,h_shade,size_t(N)*sizeof(float4),cudaMemcpyHostToDevice,0));
    ck(cudaMemcpyAsync(d_nodes,h_nodes,size_t(nn)*sizeof(N32),cudaMemcpyHostToDevice,0));
    Scene d=s; d.triangles=nullptr;
    int count=s.width*s.height*s.spp;
    const int CH=1<<20;
    for(int off=0;off<count;off+=CH){
        int end=std::min(count,off+CH);
        trace_kernel<<<(end-off+127)/128,128>>>(d,d_geom,d_shade,d_nodes,d_samples,off,end);
    }
    average_kernel<<<(s.width*s.height+127)/128,128>>>(d,d_samples,device_rgb);
    ck(cudaGetLastError());
}

#include <cub/cub.cuh>
#include <cuda/atomic>
#include "render_math.cuh"
#include <cstdio>
#include <cstdlib>
#include <algorithm>

// Each node stores both child bounds and references in four vector loads.
struct alignas(16) FastNode { float4 a,b,c,d; };
// Relative-origin plane and barycentric transforms, evaluated independently for each ray.
struct alignas(16) FastTri { float4 a,e1,e2; };
struct alignas(16) Material { float4 n,c; };
static FastNode* gNodes;
static FastTri* gTris;
static Material* gMats;
static float3* gSamples;
static int* pixelCandidates;
static unsigned char* pixelCounts;
static const int batchPixels=16384;
struct BuildNode { float3 lo,hi; int left,right,parent,count,height; };
static BuildNode* buildNodes;
static Triangle* inputTris;
static unsigned *keys0,*keys1;
static int *ids0,*ids1,*arrivals;
static int* sceneBounds;
static void* sortTemp;static size_t sortBytes;

static void check(cudaError_t e) { if(e!=cudaSuccess){fprintf(stderr,"solution: %s\n",cudaGetErrorString(e));exit(2);} }

__device__ __forceinline__ V<float> norm(V<float> v){return v*rsqrtf(v.dot(v));}
__device__ __forceinline__ Ray<float> fastCamera(const Scene& s,int pixel,int sid){
    unsigned key=s.seed+unsigned(pixel)*0x9e3779b9u+unsigned(sid)*0x85ebca6bu;
    float x=(float(pixel%s.width)+sample<float>(key))*(2.f/s.width)-1.f;
    float y=1.f-(float(pixel/s.width)+sample<float>(key^0xa511e9b3u))*(2.f/s.height);
    return {V<float>(s.eye),norm(V<float>(s.w)+V<float>(s.u)*x+V<float>(s.v)*y)};
}
struct Query {
    const FastNode* nodes; const FastTri* tris; const Material* mats;
    const int* candidates;const unsigned char* counts;
    __device__ __forceinline__ Hit<float> primary(Ray<float> r,int pixel) const {
        int count=counts[pixel];if(count==255)return closest(r,1e20f);Hit<float> h{1e20f,-1};
        for(int j=0;j<count;j++){int id=candidates[size_t(pixel)*32+j];float t;if(tri(id,r,h.t,t))h={t,id};}return h;
    }
    __device__ __forceinline__ bool tri(int id, Ray<float> r, float limit,float& t,float margin=0.f) const {
        FastTri v=tris[id];
        V<float> normal(v.a.w,v.e1.w,v.e2.w),delta=r.o-V<float>(v.a.x,v.a.y,v.a.z);
        float det=normal.dot(r.d);if(fabsf(det)<1e-10f)return false;
        float d=__fdividef(-normal.dot(delta),det);if(d<=.0002f||d>=limit)return false;
        V<float> p=delta+r.d*d;
        float u=v.e1.x*p.x+v.e1.y*p.y+v.e1.z*p.z;
        if(u<margin||u>1.f-margin)return false;
        float b=v.e2.x*p.x+v.e2.y*p.y+v.e2.z*p.z;
        if(b<margin||u+b>1.f-margin)return false;
        t=d;return true;
    }
    __device__ __forceinline__ float aabb(float3 lo,float3 hi,V<float> o,V<float> inv,float limit) const {
        float x1=(lo.x-o.x)*inv.x, x2=(hi.x-o.x)*inv.x;
        float y1=(lo.y-o.y)*inv.y, y2=(hi.y-o.y)*inv.y;
        float z1=(lo.z-o.z)*inv.z, z2=(hi.z-o.z)*inv.z;
        float l=fmaxf(.0002f,fmaxf(fminf(x1,x2),fmaxf(fminf(y1,y2),fminf(z1,z2))));
        float h=fminf(limit,fminf(fmaxf(x1,x2),fminf(fmaxf(y1,y2),fmaxf(z1,z2))));
        return l<=h?l:1e30f;
    }
    template<bool Any> __device__ __noinline__ Hit<float> find(Ray<float> r,float limit) const {
        V<float> inv(__fdividef(1.f,(fabsf(r.d.x)>1e-30f?r.d.x:copysignf(1e-30f,r.d.x))),__fdividef(1.f,(fabsf(r.d.y)>1e-30f?r.d.y:copysignf(1e-30f,r.d.y))),__fdividef(1.f,(fabsf(r.d.z)>1e-30f?r.d.z:copysignf(1e-30f,r.d.z))));
        int stack[64],sp=0,cur=0;Hit<float> hit{limit,-1};
        while(true){
            if(cur<0){
                unsigned v=~cur;int start=v>>4,count=(v&15)+1;
                for(int i=0;i<count;i++){float t;if(tri(start+i,r,hit.t,t)){hit={t,start+i};if(Any)return hit;}}
                if(!sp)break;cur=stack[--sp];
            }else{
                FastNode n=nodes[cur];
                float l=aabb(make_float3(n.a.x,n.a.y,n.a.z),make_float3(n.b.x,n.b.y,n.b.z),r.o,inv,hit.t);
                float rr=aabb(make_float3(n.c.x,n.c.y,n.c.z),make_float3(n.d.x,n.d.y,n.d.z),r.o,inv,hit.t);
                int lc=__float_as_int(n.a.w),rc=__float_as_int(n.c.w);
                if(l<1e30f && rr<1e30f){if(l>rr){int t=lc;lc=rc;rc=t;}stack[sp++]=rc;cur=lc;}
                else if(l<1e30f)cur=lc;
                else if(rr<1e30f)cur=rc;
                else {if(!sp)break;cur=stack[--sp];}
            }
        }
        return hit;
    }
    __device__ Hit<float> closest(Ray<float> r,float limit)const{return find<false>(r,limit);}
    __device__ bool blocked(Ray<float> r,float limit)const{return find<true>(r,limit).id>=0;}
};
__device__ __forceinline__ V<float> shade(const Scene& s,int pixel,int sid,Query q){
    Ray<float> r=fastCamera(s,pixel,sid);V<float> result,through(1,1,1);
    V<float> l=norm(V<float>(s.light));
    for(int depth=0;depth<s.max_depth;depth++){
        Hit<float> hit=depth==0?q.primary(r,pixel):q.closest(r,1e20f);
        if(hit.id<0){result=result+through*sky(r.d);break;}
        Material mat=q.mats[hit.id];V<float> n(mat.n.x,mat.n.y,mat.n.z);
        if(n.dot(r.d)>0)n=n*-1.f;
        V<float> p=r.o+r.d*hit.t+n*.001f;
        float cosine=fmaxf(0.f,n.dot(l));
        float visible=cosine>0&&!q.blocked({p,l},1e20f)?1.f:0.f;
        int open=0;V<float> axis=fabsf(n.z)<.8f?V<float>(0,0,1):V<float>(0,1,0);
        V<float> tx=norm(axis.cross(n)),ty=n.cross(tx);
        for(int a=0;a<s.ao;a++){
            unsigned key=s.seed+unsigned(pixel)*0x9e3779b9u+unsigned(sid)*0x85ebca6bu+unsigned(depth)*0xc2b2ae35u+unsigned(a)*0x27d4eb2du;
            float x=2.f*sample<float>(key^0x68bc21ebu)-1.f,y=2.f*sample<float>(key^0x02e5be93u)-1.f;
            float z=.25f+.75f*sample<float>(key^0x967a889bu);
            V<float> dir=norm(tx*x+ty*y+n*z);open+=!q.blocked({p,dir},s.ao_radius);
        }
        float ambient=s.ao?float(open)/s.ao:1.f;
        float value=.08f+.20f*ambient+.72f*cosine*visible;
        result=result+through*V<float>(mat.c.x,mat.c.y,mat.c.z)*(value*(1.f-mat.c.w));
        through=through*mat.c.w;
        if(mat.c.w==0||depth+1==s.max_depth)break;
        r={p,norm(r.d-n*(2.f*r.d.dot(n)))};
    }return result;
}
__global__ __launch_bounds__(128,8) void trace(Scene s,Query q,float3* buf,int firstPixel,int n){
    int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=n*s.spp)return;
    V<float> c=shade(s,firstPixel+i/s.spp,i%s.spp,q);buf[i]=make_float3(c.x,c.y,c.z);
}
__global__ void average(Scene s,const float3* buf,float* out,int firstPixel,int n){
    int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=n)return;
    V<float> sum;for(int j=0;j<s.spp;j++){float3 c=buf[i*s.spp+j];sum=sum+V<float>(c.x,c.y,c.z);}
    out[(firstPixel+i)*3]=sum.x/s.spp;out[(firstPixel+i)*3+1]=sum.y/s.spp;out[(firstPixel+i)*3+2]=sum.z/s.spp;
}


__device__ __forceinline__ bool frustum(float3 lo,float3 hi,const V<float>* planes,const float* distances,int count){
    for(int j=0;j<count;j++){V<float> p=planes[j];float x=p.x>=0?hi.x:lo.x,y=p.y>=0?hi.y:lo.y,z=p.z>=0?hi.z:lo.z;if(p.x*x+p.y*y+p.z*z<distances[j])return false;}return true;
}
// A conservative pixel beam supplies an acceleration list, never a reused sample result.
__global__ void makeCandidates(Scene s,Query q,int* ids,unsigned char* counts){
    int pixel=blockIdx.x*blockDim.x+threadIdx.x;if(pixel>=s.width*s.height)return;
    V<float> u(s.u),v(s.v),w(s.w),eye(s.eye);
    float x0=float(pixel%s.width)/s.width*2.f-1.f,x1=float(pixel%s.width+1)/s.width*2.f-1.f;
    float y0=1.f-float(pixel/s.width+1)/s.height*2.f,y1=1.f-float(pixel/s.width)/s.height*2.f;
    V<float> pl[5];float ds[5];int np=4;
    pl[0]=(w+u*x0).cross(v);if(pl[0].dot(u)<0)pl[0]=pl[0]*-1.f;
    pl[1]=(w+u*x1).cross(v);if(pl[1].dot(u)>0)pl[1]=pl[1]*-1.f;
    pl[2]=(w+v*y0).cross(u);if(pl[2].dot(v)<0)pl[2]=pl[2]*-1.f;
    pl[3]=(w+v*y1).cross(u);if(pl[3].dot(v)>0)pl[3]=pl[3]*-1.f;
    for(int j=0;j<4;j++)ds[j]=pl[j].dot(eye)-2e-5f*sqrtf(pl[j].dot(pl[j]));
    Ray<float> r{eye,(w+u*((x0+x1)*.5f)+v*((y0+y1)*.5f)).unit()};
    Hit<float> center=q.closest(r,1e20f);
    if(center.id>=0){
        float t;bool cover=true;
        cover &=q.tri(center.id,{eye,(w+u*x0+v*y0).unit()},1e20f,t,1e-4f);
        cover &=q.tri(center.id,{eye,(w+u*x1+v*y0).unit()},1e20f,t,1e-4f);
        cover &=q.tri(center.id,{eye,(w+u*x0+v*y1).unit()},1e20f,t,1e-4f);
        cover &=q.tri(center.id,{eye,(w+u*x1+v*y1).unit()},1e20f,t,1e-4f);
        if(cover){Material mat=q.mats[center.id];FastTri a=q.tris[center.id];V<float> nor(mat.n.x,mat.n.y,mat.n.z),p(a.a.x,a.a.y,a.a.z);if(nor.dot(eye-p)<0)nor=nor*-1.f;pl[4]=nor;ds[4]=nor.dot(p)-1e-4f;np=5;}
    }
    int stack[64],sp=0,cur=0,count=0;
    while(true){
        if(cur<0){
            int id=(~cur)>>4;
            if(count==32){counts[pixel]=255;return;}
            ids[size_t(pixel)*32+count++]=id;
            if(!sp)break;cur=stack[--sp];
        }else{
            FastNode n=q.nodes[cur];
            bool l=frustum(make_float3(n.a.x,n.a.y,n.a.z),make_float3(n.b.x,n.b.y,n.b.z),pl,ds,np);
            bool r=frustum(make_float3(n.c.x,n.c.y,n.c.z),make_float3(n.d.x,n.d.y,n.d.z),pl,ds,np);
            if(l){if(r)stack[sp++]=__float_as_int(n.c.w);cur=__float_as_int(n.a.w);}
            else if(r)cur=__float_as_int(n.c.w);
            else {if(!sp)break;cur=stack[--sp];}
        }
    }counts[pixel]=count;
}
__device__ float ar(float3 lo,float3 hi){float x=hi.x-lo.x,y=hi.y-lo.y,z=hi.z-lo.z;return x*y+x*z+y*z;}
__device__ float3 min3(float3 a,float3 b){return make_float3(fminf(a.x,b.x),fminf(a.y,b.y),fminf(a.z,b.z));}
__device__ float3 max3(float3 a,float3 b){return make_float3(fmaxf(a.x,b.x),fmaxf(a.y,b.y),fmaxf(a.z,b.z));}
__global__ void resetBounds(int* box){int i=threadIdx.x;if(i<3){box[i]=__float_as_int(100.f);box[i+3]=0;}}
__global__ void boundsKernel(const Triangle* t,int n,int* box){
    int i=blockIdx.x*blockDim.x+threadIdx.x;
    float3 lo=make_float3(100.f,100.f,100.f),hi=make_float3(0,0,0);
    if(i<n){Triangle a=t[i];lo=make_float3((fminf(a.v0[0],fminf(a.v1[0],a.v2[0]))+fmaxf(a.v0[0],fmaxf(a.v1[0],a.v2[0])))*.5f+32.f,(fminf(a.v0[1],fminf(a.v1[1],a.v2[1]))+fmaxf(a.v0[1],fmaxf(a.v1[1],a.v2[1])))*.5f+32.f,(fminf(a.v0[2],fminf(a.v1[2],a.v2[2]))+fmaxf(a.v0[2],fmaxf(a.v1[2],a.v2[2])))*.5f+32.f);hi=lo;}
    for(int d=16;d;d>>=1){lo=min3(lo,make_float3(__shfl_down_sync(0xffffffff,lo.x,d),__shfl_down_sync(0xffffffff,lo.y,d),__shfl_down_sync(0xffffffff,lo.z,d)));hi=max3(hi,make_float3(__shfl_down_sync(0xffffffff,hi.x,d),__shfl_down_sync(0xffffffff,hi.y,d),__shfl_down_sync(0xffffffff,hi.z,d)));}
    if((threadIdx.x&31)==0){atomicMin(box,__float_as_int(lo.x));atomicMin(box+1,__float_as_int(lo.y));atomicMin(box+2,__float_as_int(lo.z));atomicMax(box+3,__float_as_int(hi.x));atomicMax(box+4,__float_as_int(hi.y));atomicMax(box+5,__float_as_int(hi.z));}
}
__device__ unsigned expand(unsigned x){x=(x|(x<<16))&0x030000ffu;x=(x|(x<<8))&0x0300f00fu;x=(x|(x<<4))&0x030c30c3u;x=(x|(x<<2))&0x09249249u;return x;}
__global__ void keysKernel(const Triangle* t,int n,const int* box,unsigned* keys,int* ids){
    int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=n)return;
    unsigned xyz[3];
    for(int k=0;k<3;k++){float c=(fminf(t[i].v0[k],fminf(t[i].v1[k],t[i].v2[k]))+fmaxf(t[i].v0[k],fmaxf(t[i].v1[k],t[i].v2[k])))*.5f+32.f;float lo=__int_as_float(box[k]),hi=__int_as_float(box[k+3]);xyz[k]=min(1023u,unsigned(fmaxf(0.f,(c-lo)*(1024.f/fmaxf(1e-10f,hi-lo)))));}
    keys[i]=(expand(xyz[0])<<2)|(expand(xyz[1])<<1)|expand(xyz[2]);ids[i]=i;
}
__device__ int delta(const unsigned* keys,int n,int a,int b){if(b<0||b>=n)return -1;unsigned x=keys[a]^keys[b];return x?__clz(x):32+__clz(unsigned(a^b));}
__global__ void topology(const unsigned* keys,int n,BuildNode* nodes){
    int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=n-1)return;
    int d=delta(keys,n,i,i+1)-delta(keys,n,i,i-1)>=0?1:-1;
    int dm=delta(keys,n,i,i-d),lm=2;
    while(delta(keys,n,i,i+lm*d)>dm)lm*=2;
    int len=0;for(int t=lm/2;t>=1;t/=2)if(delta(keys,n,i,i+(len+t)*d)>dm)len+=t;
    int j=i+len*d,dp=delta(keys,n,i,j),split=0;
    for(int t=(len+1)/2;t>=1;){if(delta(keys,n,i,i+(split+t)*d)>dp)split+=t;if(t==1)break;t=(t+1)/2;}
    int g=i+split*d+min(d,0);
    int l=min(i,j)==g?g+n-1:g;int r=max(i,j)==g+1?g+n:g+1;
    nodes[i].left=l;nodes[i].right=r;nodes[l].parent=i;nodes[r].parent=i;
    if(i==0)nodes[0].parent=-1;
}
__global__ void prepare(const Triangle* ts,int n,const int* ids,BuildNode* nodes,FastTri* tris,Material* mats){
    int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=n)return;
    Triangle t=ts[ids[i]];V<float> a(t.v0);
    V<double> d1=V<double>(t.v1)-V<double>(t.v0),d2=V<double>(t.v2)-V<double>(t.v0),dn=d1.cross(d2);double inv=1.0/dn.dot(dn);V<double> du=d2.cross(dn)*inv,dv=dn.cross(d1)*inv;
    tris[i]={make_float4(a.x,a.y,a.z,float(dn.x)),make_float4(float(du.x),float(du.y),float(du.z),float(dn.y)),make_float4(float(dv.x),float(dv.y),float(dv.z),float(dn.z))};
    V<double> dnunit=dn*(1.0/sqrt(dn.dot(dn)));
    mats[i]={make_float4(float(dnunit.x),float(dnunit.y),float(dnunit.z),0),make_float4(t.color[0],t.color[1],t.color[2],t.mirror)};
    BuildNode& b=nodes[i+n-1];b.lo=make_float3(fminf(t.v0[0],fminf(t.v1[0],t.v2[0])),fminf(t.v0[1],fminf(t.v1[1],t.v2[1])),fminf(t.v0[2],fminf(t.v1[2],t.v2[2])));b.hi=make_float3(fmaxf(t.v0[0],fmaxf(t.v1[0],t.v2[0])),fmaxf(t.v0[1],fmaxf(t.v1[1],t.v2[1])),fmaxf(t.v0[2],fmaxf(t.v1[2],t.v2[2])));b.count=1;b.height=0;
}
__device__ void rotateNode(BuildNode* nodes,int id,int n){
    // Descendants have finished. Compare the four rotations around this node.
    for(int iter=0;iter<2;iter++){
        int l=nodes[id].left,r=nodes[id].right;BuildNode a=nodes[l],b=nodes[r];
        float best=0.f;int choice=-1;
        if(l<n-1){BuildNode c=nodes[a.left],d=nodes[a.right];float base=ar(a.lo,a.hi)*a.count;
            float v=ar(min3(b.lo,d.lo),max3(b.hi,d.hi))*(b.count+d.count)-base;if(v<best&&1+max(c.height,1+max(b.height,d.height))<=56){best=v;choice=0;}
            v=ar(min3(c.lo,b.lo),max3(c.hi,b.hi))*(c.count+b.count)-base;if(v<best&&1+max(d.height,1+max(c.height,b.height))<=56){best=v;choice=1;}}
        if(r<n-1){BuildNode c=nodes[b.left],d=nodes[b.right];float base=ar(b.lo,b.hi)*b.count;
            float v=ar(min3(a.lo,d.lo),max3(a.hi,d.hi))*(a.count+d.count)-base;if(v<best&&1+max(c.height,1+max(a.height,d.height))<=56){best=v;choice=2;}
            v=ar(min3(c.lo,a.lo),max3(c.hi,a.hi))*(c.count+a.count)-base;if(v<best&&1+max(d.height,1+max(c.height,a.height))<=56){best=v;choice=3;}}
        if(choice<0)break;
        int sub,down,up;
        if(choice<2){sub=l;down=r;up=choice==0?a.left:a.right;nodes[id].right=up;if(choice==0)nodes[sub].left=down;else nodes[sub].right=down;}
        else{sub=r;down=l;up=choice==2?b.left:b.right;nodes[id].left=up;if(choice==2)nodes[sub].left=down;else nodes[sub].right=down;}
        nodes[up].parent=id;nodes[down].parent=sub;
        BuildNode x=nodes[nodes[sub].left],y=nodes[nodes[sub].right];nodes[sub].lo=min3(x.lo,y.lo);nodes[sub].hi=max3(x.hi,y.hi);nodes[sub].count=x.count+y.count;nodes[sub].height=1+max(x.height,y.height);
    }
}
__global__ void refit(BuildNode* nodes,int n,int* arrivals){
    int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=n)return;
    int id=i+n-1;
    for(;;){
        __threadfence();int par=nodes[id].parent;if(par<0)return;
        cuda::atomic_ref<int,cuda::thread_scope_device> arrived(arrivals[par]);
        if(arrived.fetch_add(1,cuda::std::memory_order_acq_rel)==0)return;
        int l=nodes[par].left,r=nodes[par].right;BuildNode a=nodes[l],b=nodes[r];nodes[par].lo=min3(a.lo,b.lo);nodes[par].hi=max3(a.hi,b.hi);nodes[par].count=a.count+b.count;nodes[par].height=1+max(a.height,b.height);
        rotateNode(nodes,par,n);nodes[par].height=1+max(nodes[nodes[par].left].height,nodes[nodes[par].right].height);id=par;
    }
}
__global__ void convert(const BuildNode* nodes,int n,FastNode* out){
    int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=max(1,n-1))return;
    int l=n==1?0:nodes[i].left,r=n==1?0:nodes[i].right;
    BuildNode a=nodes[l],b=nodes[r];int lc=l<n-1?l:~((l-(n-1))<<4),rc=r<n-1?r:~((r-(n-1))<<4);
    out[i]={make_float4(a.lo.x-1e-5f,a.lo.y-1e-5f,a.lo.z-1e-5f,__int_as_float(lc)),make_float4(a.hi.x+1e-5f,a.hi.y+1e-5f,a.hi.z+1e-5f,0),make_float4(b.lo.x-1e-5f,b.lo.y-1e-5f,b.lo.z-1e-5f,__int_as_float(rc)),make_float4(b.hi.x+1e-5f,b.hi.y+1e-5f,b.hi.z+1e-5f,0)};
}
void init(int mt,int mp,int ms){
    check(cudaMalloc(&gNodes,(2*size_t(mt)+1)*sizeof(FastNode)));
    check(cudaMalloc(&gTris,size_t(mt)*sizeof(FastTri)));
    check(cudaMalloc(&gMats,size_t(mt)*sizeof(Material)));
    check(cudaMalloc(&gSamples,size_t(batchPixels)*ms*sizeof(float3)));
    check(cudaMalloc(&pixelCandidates,size_t(mp)*32*4));check(cudaMalloc(&pixelCounts,size_t(mp)));
    check(cudaMalloc(&buildNodes,(2*size_t(mt))*sizeof(BuildNode)));
    check(cudaMalloc(&inputTris,size_t(mt)*sizeof(Triangle)));
    check(cudaMalloc(&keys0,size_t(mt)*4));check(cudaMalloc(&keys1,size_t(mt)*4));
    check(cudaMalloc(&ids0,size_t(mt)*4));check(cudaMalloc(&ids1,size_t(mt)*4));
    check(cudaMalloc(&arrivals,size_t(mt)*4));check(cudaMalloc(&sceneBounds,24));
    check(cub::DeviceRadixSort::SortPairs(nullptr,sortBytes,keys0,keys1,ids0,ids1,mt,0,30));check(cudaMalloc(&sortTemp,sortBytes));
}
void render(const Scene& s,float* out){
    int n=s.triangle_count;
    check(cudaMemcpy(inputTris,s.triangles,size_t(n)*sizeof(Triangle),cudaMemcpyHostToDevice));
    resetBounds<<<1,32>>>(sceneBounds);boundsKernel<<<(n+255)/256,256>>>(inputTris,n,sceneBounds);
    keysKernel<<<(n+255)/256,256>>>(inputTris,n,sceneBounds,keys0,ids0);
    size_t tempBytes=sortBytes;check(cub::DeviceRadixSort::SortPairs(sortTemp,tempBytes,keys0,keys1,ids0,ids1,n,0,30));
    if(n>1)topology<<<(n+254)/256,256>>>(keys1,n,buildNodes);
    else check(cudaMemset(&buildNodes[0].parent,0xff,4));
    prepare<<<(n+255)/256,256>>>(inputTris,n,ids1,buildNodes,gTris,gMats);
    check(cudaMemset(arrivals,0,size_t(n)*4));
    // Rebuild the hierarchy from this call's geometry, including all rotation passes.
    if(n>1){for(int iter=0;iter<4;iter++){if(iter)check(cudaMemset(arrivals,0,size_t(n)*4));refit<<<(n+127)/128,128>>>(buildNodes,n,arrivals);}}
    convert<<<(n+255)/256,256>>>(buildNodes,n,gNodes);
    Scene d=s;d.triangles=nullptr;Query q{gNodes,gTris,gMats,pixelCandidates,pixelCounts};
    makeCandidates<<<(s.width*s.height+127)/128,128>>>(d,q,pixelCandidates,pixelCounts);
    int pixels=s.width*s.height;
    int chunk=batchPixels;if(s.ao>=8)chunk=std::min(chunk,std::max(128,1048576/(s.spp*(s.ao+2))));
    for(int off=0;off<pixels;off+=chunk){int count=std::min(chunk,pixels-off);trace<<<(count*s.spp+127)/128,128>>>(d,q,gSamples,off,count);average<<<(count+127)/128,128>>>(d,gSamples,out,off,count);}
    check(cudaGetLastError());
}


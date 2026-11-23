#define PAR_DEPTH 5

#include "render_math.cuh"
#include <vector>
#include <algorithm>
#include <atomic>
#include <thread>
#ifndef PAR_DEPTH
#define PAR_DEPTH 0
#endif
#define BINS 8
#define CT 1.0f
#define LEAF 4
struct Node {float lo[3],hi[3];int left,right,start,count;};
struct SahBuilder {
    const Triangle* T;int N;
    std::vector<float> lo,hi,cen;
    std::vector<int> order;std::vector<Node> nodes;
    explicit SahBuilder(const Scene& s):T(s.triangles),N(s.triangle_count){
        lo.resize(3*size_t(N));hi.resize(3*size_t(N));cen.resize(3*size_t(N));order.resize(N);
        for(int i=0;i<N;i++){const Triangle& t=T[i];
            for(int k=0;k<3;k++){float a=t.v0[k],b=t.v1[k],c=t.v2[k];
                lo[3*i+k]=std::min(a,std::min(b,c));hi[3*i+k]=std::max(a,std::max(b,c));cen[3*i+k]=(lo[3*i+k]+hi[3*i+k])*.5f;}
            order[i]=i;}
        nodes.resize(2*size_t(N)+1);next=0;build(0,N,0);nodes.resize(next.load());
    }
    std::atomic<int> next;
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
        float costs[3]={1e30f,1e30f,1e30f};int bins[3]={0,0,0};
        auto calc=[&](int k){
            float ext=chi[k]-clo[k];if(ext<1e-9f)return;
            int bc[BINS]={};float blo[BINS][3],bhi[BINS][3];
            for(int j=0;j<BINS;j++)for(int q=0;q<3;q++){blo[j][q]=1e30f;bhi[j][q]=-1e30f;}
            float scale=BINS/ext*(1-1e-6f);
            for(int i=b;i<e;i++){int t=order[i];int j=std::min(BINS-1,int((cen[3*t+k]-clo[k])*scale));
                bc[j]++;for(int q=0;q<3;q++){blo[j][q]=std::min(blo[j][q],lo[3*t+q]);bhi[j][q]=std::max(bhi[j][q],hi[3*t+q]);}}
            float rarea[BINS];int rcnt[BINS];float alo[3]={1e30f,1e30f,1e30f},ahi[3]={-1e30f,-1e30f,-1e30f};int ac=0;
            for(int j=BINS-1;j>0;j--){ac+=bc[j];for(int q=0;q<3;q++){alo[q]=std::min(alo[q],blo[j][q]);ahi[q]=std::max(ahi[q],bhi[j][q]);}
                rcnt[j]=ac;rarea[j]=ac?area(alo,ahi):0;}
            for(int q=0;q<3;q++){alo[q]=1e30f;ahi[q]=-1e30f;}ac=0;
            for(int j=1;j<BINS;j++){ac+=bc[j-1];for(int q=0;q<3;q++){alo[q]=std::min(alo[q],blo[j-1][q]);ahi[q]=std::max(ahi[q],bhi[j-1][q]);}
                if(!ac||!rcnt[j])continue;float c=area(alo,ahi)*ac+rarea[j]*rcnt[j];
                if(c<costs[k]){costs[k]=c;bins[k]=j;}}
        };
        if(depth<2 && cnt>16384){std::thread t0([&]{calc(0);});std::thread t1([&]{calc(1);});calc(2);t0.join();t1.join();}else{calc(0);calc(1);calc(2);}
        for(int k=0;k<3;k++)if(costs[k]<best){best=costs[k];bestAxis=k;bestBin=bins[k];}
        float parentArea=area(n.lo,n.hi);
        float splitCost=CT+(parentArea>0?best/parentArea:float(cnt));
        if(cnt<=LEAF&&float(cnt)<=splitCost)return id;
        int mid=-1;
        if(bestAxis>=0){
            int k=bestAxis;float ext=chi[k]-clo[k],scale=BINS/ext*(1-1e-6f),c0=clo[k];
            mid=int(std::partition(order.begin()+b,order.begin()+e,[&](int t){return std::min(BINS-1,int((cen[3*t+k]-c0)*scale))<bestBin;})-order.begin());
        }
        if(mid<=b||mid>=e){
            if(cnt<=15)return id;
            int axis=0;for(int k=1;k<3;k++)if(chi[k]-clo[k]>chi[axis]-clo[axis])axis=k;
            mid=(b+e)/2;std::nth_element(order.begin()+b,order.begin()+mid,order.begin()+e,[&](int x,int y){return cen[3*x+axis]<cen[3*y+axis];});
        }
        int l,r;
        if(depth<PAR_DEPTH&&cnt>4096){std::thread th([&]{l=build(b,mid,depth+1);});r=build(mid,e,depth+1);th.join();}
        else{l=build(b,mid,depth+1);r=build(mid,e,depth+1);}
        nodes[id].left=l;nodes[id].right=r;nodes[id].count=0;return id;
    }
};

template<class R> HD bool box(const Node& n,Ray<R> r,R limit,R& near){
    R a=R(.0002),b=limit;
    for(int k=0;k<3;k++){
        R o=r.o.at(k),d=r.d.at(k);
        if(fabs(d)<R(1e-30)){
            if(o<R(n.lo[k])-R(1e-5)||o>R(n.hi[k])+R(1e-5))return false;
            continue;
        }
        R x=(R(n.lo[k])-R(1e-5)-o)/d,y=(R(n.hi[k])+R(1e-5)-o)/d;
        if(x>y){R z=x;x=y;y=z;}
        if(x>a)a=x;if(y<b)b=y;if(a>b)return false;
    }
    near=a;return true;
}

#include <cstdio>
#include <cstdlib>
static Triangle *dt;
struct __align__(16) GNode {float lo[3];int a;float hi[3];int b;};
static GNode *dn;
static float *samples;
static void ck(cudaError_t e){if(e!=cudaSuccess){fprintf(stderr,"CUDA: %s\n",cudaGetErrorString(e));exit(2);}}
struct Query {
 const Triangle* tris; const GNode* nodes;
 __device__ const Triangle& triangle(int id)const{return tris[id];}
 __device__ bool bounds(const GNode& n, Ray<float> r, V<float> inv, float limit, float& near) const {
   float4 l=*reinterpret_cast<const float4*>(&n.lo[0]);float4 h=*reinterpret_cast<const float4*>(&n.hi[0]);
   float ax=(l.x-r.o.x)*inv.x, bx=(h.x-r.o.x)*inv.x;
   float ay=(l.y-r.o.y)*inv.y, by=(h.y-r.o.y)*inv.y;
   float az=(l.z-r.o.z)*inv.z, bz=(h.z-r.o.z)*inv.z;
   float lo=fmaxf(.0002f,fmaxf(fminf(ax,bx),fmaxf(fminf(ay,by),fminf(az,bz))));
   float hi=fminf(limit,fminf(fmaxf(ax,bx),fminf(fmaxf(ay,by),fmaxf(az,bz)))); near=lo;return lo<=hi;
 }
 __device__ bool fastTri(int id, Ray<float> r,float limit,float& distance)const{const Triangle& t=tris[id];V<float> a(t.v0),e1=V<float>(t.v1)-a,e2=V<float>(t.v2)-a;V<float> p=r.d.cross(e2);float det=e1.dot(p);if(fabsf(det)<1e-10f)return false;V<float> v=r.o-a;float u=v.dot(p);if(det>0 ? (u<0||u>det) : (u>0||u<det))return false;V<float> q=v.cross(e1);float w=r.d.dot(q);float d=e2.dot(q);if(det<0){det=-det;u=-u;w=-w;d=-d;}if(u<0||w<0||u+w>det||d<=.0002f*det||d>=limit*det)return false;distance=d/det;return true;}
 template<bool any> __device__ __forceinline__ Hit<float> find(Ray<float> r,float limit) const {
  Hit<float> h{limit,-1};int stack[64],sp=0,current=0;bool popped=false;
  V<float> inv(1.0f/(fabsf(r.d.x)<1e-30f?copysignf(1e-30f,r.d.x):r.d.x),1.0f/(fabsf(r.d.y)<1e-30f?copysignf(1e-30f,r.d.y):r.d.y),1.0f/(fabsf(r.d.z)<1e-30f?copysignf(1e-30f,r.d.z):r.d.z));
  for(;;){const GNode& n=nodes[current];if constexpr(!any){if(popped){float near;if(!bounds(n,r,inv,h.t,near)){if(!sp)break;current=stack[--sp];popped=true;continue;}popped=false;}}if(n.a<0){for(int j=0;j<n.b;j++){int id=(~n.a)+j;float d;if(fastTri(id,r,h.t,d)){h={d,id};if(any)return h;}}}
    else {float a,b;bool x=bounds(nodes[n.a],r,inv,h.t,a),y=bounds(nodes[n.b],r,inv,h.t,b);if(x&&y){if(a<b){stack[sp++]=n.b;current=n.a;}else{stack[sp++]=n.a;current=n.b;}continue;}if(x){current=n.a;continue;}if(y){current=n.b;continue;}}
    if(!sp)break;current=stack[--sp];popped=true;
  }return h;
 }
 __device__ Hit<float> closest(Ray<float> r,float limit){return find<false>(r,limit);}
 __device__ bool blocked(Ray<float> r,float limit){return find<true>(r,limit).id>=0;}
};
template<int G> __global__ void trace(Scene s,Query q,float* buf,int sid,int offset,int end){int i0=blockIdx.x*blockDim.x+threadIdx.x; int p=offset+i0/G; sid+=i0%G;if(p>=end||sid>=s.spp)return;V<float> c=radiance<float>(s,p,sid,q);size_t i=(size_t(sid%G)*s.width*s.height+p)*3;buf[i]=c.x;buf[i+1]=c.y;buf[i+2]=c.z;}
__global__ void average(Scene s,const float* buf,float* out,int count,bool first,bool last){int p=blockIdx.x*blockDim.x+threadIdx.x;int n=s.width*s.height;if(p>=n)return;float x=first?0:out[3*p],y=first?0:out[3*p+1],z=first?0:out[3*p+2];for(int j=0;j<count;j++){size_t i=(size_t(j)*n+p)*3;x+=buf[i];y+=buf[i+1];z+=buf[i+2];}if(last){x/=s.spp;y/=s.spp;z/=s.spp;}out[3*p]=x;out[3*p+1]=y;out[3*p+2]=z;}
void init(int mt,int mp,int ms){ck(cudaMalloc(&dt,size_t(mt)*sizeof(Triangle)));ck(cudaMalloc(&dn,(2*size_t(mt)+1)*sizeof(GNode)));ck(cudaMalloc(&samples,size_t(mp)*std::min(ms,56)*3*sizeof(float)));}
template<int G> void launch(Scene d, Query q, int n, int sid, int chunk){for(int off=0;off<n;off+=chunk){int end=std::min(n,off+chunk);trace<G><<<((end-off)*G+127)/128,128>>>(d,q,samples,sid,off,end);}}
void render(const Scene& s,float* out){SahBuilder tree(s);std::vector<Triangle> sorted(s.triangle_count);for(int i=0;i<s.triangle_count;i++)sorted[i]=s.triangles[tree.order[i]];ck(cudaMemcpy(dt,sorted.data(),sorted.size()*sizeof(Triangle),cudaMemcpyHostToDevice));std::vector<GNode> compact(tree.nodes.size());for(size_t i=0;i<compact.size();i++){const Node& n=tree.nodes[i];GNode& g=compact[i];for(int j=0;j<3;j++){g.lo[j]=n.lo[j]-1e-5f;g.hi[j]=n.hi[j]+1e-5f;}g.a=n.count?~n.start:n.left;g.b=n.count?n.count:n.right;}ck(cudaMemcpy(dn,compact.data(),compact.size()*sizeof(GNode),cudaMemcpyHostToDevice));Scene d=s;d.triangles=nullptr;Query q{dt,dn};int n=s.width*s.height;int chunk=s.ao>=8?4096:131072;int group=(s.spp>=56 && s.spp%56==0)?56:32;for(int sid=0;sid<s.spp;sid+=group){int count=std::min(group,s.spp-sid);if(group==56)launch<56>(d,q,n,sid,chunk);else if(count==1)launch<1>(d,q,n,sid,chunk);else if(count<=4)launch<4>(d,q,n,sid,chunk);else if(count<=16)launch<16>(d,q,n,sid,chunk);else launch<32>(d,q,n,sid,chunk);average<<<(n+127)/128,128>>>(d,samples,out,count,sid==0,sid+count==s.spp);}ck(cudaGetLastError());}


#define PAR_DEPTH 8
#define BINS 16
#define CT 2.0f
#define LEAF 32
#include "rt.h"
#include <cuda_runtime.h>
#include <vector>
#include <atomic>
#include <thread>
#include <algorithm>
#include <cstdio>
#include <cmath>
#include <cstdint>

#define HD __host__ __device__
template<class R> struct V {
    R x,y,z;
    HD V(R a=0,R b=0,R c=0):x(a),y(b),z(c){}
    HD explicit V(const float* p):x(p[0]),y(p[1]),z(p[2]){}
    HD V operator+(V b)const{return V(x+b.x,y+b.y,z+b.z);}
    HD V operator-(V b)const{return V(x-b.x,y-b.y,z-b.z);}
    HD V operator*(R s)const{return V(x*s,y*s,z*s);}
    HD V operator*(V b)const{return V(x*b.x,y*b.y,z*b.z);}
    HD R dot(V b)const{return x*b.x+y*b.y+z*b.z;}
    HD V cross(V b)const{return V(y*b.z-z*b.y,z*b.x-x*b.z,x*b.y-y*b.x);}
    HD V unit()const{return *this*(R(1)/sqrt(dot(*this)));}
    HD R at(int k)const{return k==0?x:k==1?y:z;}
};
HD inline uint32_t mix32(uint32_t x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;return x^(x>>16);}
template<class R> HD R sample(uint32_t x){return R(mix32(x)>>8)*R(1.0/16777216.0);}
template<class R> struct Ray {V<R> o,d;};
template<class R> struct Hit {R t; int id;};
template<class R> HD bool intersect(const Triangle& t,Ray<R> r,R limit,R& distance){
    V<R> a(t.v0),e1=V<R>(t.v1)-a,e2=V<R>(t.v2)-a;
    V<R> p=r.d.cross(e2);R det=e1.dot(p);
    if(fabs(det)<R(1e-10))return false;
    R inv=R(1)/det;V<R> s=r.o-a;R u=s.dot(p)*inv;
    if(u<R(0)||u>R(1))return false;
    V<R> q=s.cross(e1);R v=r.d.dot(q)*inv;
    if(v<R(0)||u+v>R(1))return false;
    R d=e2.dot(q)*inv;
    if(d<=R(0.0002)||d>=limit)return false;
    distance=d;return true;
}
template<class R> HD Ray<R> camera(const Scene& s,int pixel,int sample_id){
    uint32_t key=s.seed+uint32_t(pixel)*0x9e3779b9u+uint32_t(sample_id)*0x85ebca6bu;
    R x=(R(pixel%s.width)+sample<R>(key))/R(s.width)*R(2)-R(1);
    R y=R(1)-(R(pixel/s.width)+sample<R>(key^0xa511e9b3u))/R(s.height)*R(2);
    return {V<R>(s.eye),(V<R>(s.w)+V<R>(s.u)*x+V<R>(s.v)*y).unit()};
}
template<class R> HD V<R> sky(V<R> d){R a=R(.5)*(d.y+R(1));return V<R>(R(.95),R(.93),R(.95))*(R(1)-a)+V<R>(R(.40),R(.55),R(.85))*a;}
template<class R,class Query> HD V<R> radiance(const Scene& s,int pixel,int sid,Query& query){
    Ray<R> r=camera<R>(s,pixel,sid);V<R> result,through(R(1),R(1),R(1));
    for(int depth=0;depth<s.max_depth;depth++){
        Hit<R> hit=query.closest(r,R(1e20));
        if(hit.id<0){result=result+through*sky(r.d);break;}
        const Triangle& t=query.triangle(hit.id);
        V<R> n=(V<R>(t.v1)-V<R>(t.v0)).cross(V<R>(t.v2)-V<R>(t.v0)).unit();
        if(n.dot(r.d)>0)n=n*R(-1);
        V<R> p=r.o+r.d*hit.t+n*R(.001);
        V<R> l=V<R>(s.light).unit();R cosine=n.dot(l);if(cosine<0)cosine=0;
        R visible=cosine>0&&!query.blocked({p,l},R(1e20))?R(1):R(0);
        int open=0;
        V<R> axis=fabs(n.z)<R(.8)?V<R>(0,0,1):V<R>(0,1,0);
        V<R> tx=axis.cross(n).unit(),ty=n.cross(tx);
        for(int a=0;a<s.ao;a++){
            uint32_t key=s.seed+uint32_t(pixel)*0x9e3779b9u+uint32_t(sid)*0x85ebca6bu+uint32_t(depth)*0xc2b2ae35u+uint32_t(a)*0x27d4eb2du;
            R x=R(2)*sample<R>(key^0x68bc21ebu)-R(1),y=R(2)*sample<R>(key^0x02e5be93u)-R(1);
            R z=R(.25)+R(.75)*sample<R>(key^0x967a889bu);
            V<R> dir=(tx*x+ty*y+n*z).unit();
            open+=!query.blocked({p,dir},R(s.ao_radius));
        }
        R ambient=s.ao?R(open)/R(s.ao):R(1);
        R value=R(.08)+R(.20)*ambient+R(.72)*cosine*visible;
        result=result+through*V<R>(t.color)*(value*(R(1)-R(t.mirror)));
        through=through*R(t.mirror);
        if(t.mirror==0)break;
        r={p,(r.d-n*(R(2)*r.d.dot(n))).unit()};
    }
    return result;
}

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
        for(int k=0;k<3;k++){
            float ext=chi[k]-clo[k];if(ext<1e-9f)continue;
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
                if(c<best){best=c;bestAxis=k;bestBin=j;}}
        }
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
        if(fabs(d)<R(1e-30)){if(o<R(n.lo[k])-R(1e-5)||o>R(n.hi[k])+R(1e-5))return false;continue;}
        R x=(R(n.lo[k])-R(1e-5)-o)/d,y=(R(n.hi[k])+R(1e-5)-o)/d;
        if(x>y){R z=x;x=y;y=z;}
        if(x>a)a=x;if(y<b)b=y;if(a>b)return false;
    }
    near=a;return true;
}

struct Query {
    const Triangle* tris; const Node* nodes; const int* ids;
    __device__ const Triangle& triangle(int id) const { return tris[id]; }
    __device__ Hit<float> find(Ray<float> r,float limit,bool any){
        Hit<float> hit{limit,-1};int stack[64],sp=0;stack[sp++]=0;
        while(sp){const Node& n=nodes[stack[--sp]];float near;
            if(!box(n,r,hit.t,near))continue;
            if(n.count){for(int i=0;i<n.count;i++){int id=ids[n.start+i];float d;
                if(intersect(tris[id],r,hit.t,d)){hit={d,id};if(any)return hit;}}}
            else{stack[sp++]=n.left;stack[sp++]=n.right;}
        }return hit;
    }
    __device__ Hit<float> closest(Ray<float> r,float limit){return find(r,limit,false);}
    __device__ bool blocked(Ray<float> r,float limit){return find(r,limit,true).id>=0;}
};

__global__ void trace(Scene s,Query q,float* buf,int offset,int end){
    int i=offset+blockIdx.x*blockDim.x+threadIdx.x;if(i>=end)return;
    V<float> c=radiance<float>(s,i/s.spp,i%s.spp,q);
    buf[3*size_t(i)]=c.x;buf[3*size_t(i)+1]=c.y;buf[3*size_t(i)+2]=c.z;
}
__global__ void average(Scene s,const float* buf,float* out){
    int p=blockIdx.x*blockDim.x+threadIdx.x;if(p>=s.width*s.height)return;
    for(int k=0;k<3;k++){float sum=0;for(int j=0;j<s.spp;j++)sum+=buf[3*(size_t(p)*s.spp+j)+k];out[3*p+k]=sum/s.spp;}
}

static Triangle* dt; static Node* dn; static int* di; static float* dbuf;
static void ck(cudaError_t e){if(e!=cudaSuccess){fprintf(stderr,"solution: %s\n",cudaGetErrorString(e));exit(2);}}

void init(int max_triangles,int max_pixels,int max_samples){
    ck(cudaMalloc(&dt,size_t(max_triangles)*sizeof(Triangle)));
    ck(cudaMalloc(&dn,(2*size_t(max_triangles)+1)*sizeof(Node)));
    ck(cudaMalloc(&di,size_t(max_triangles)*sizeof(int)));
    ck(cudaMalloc(&dbuf,size_t(max_pixels)*size_t(max_samples)*3*sizeof(float)));
}

void render(const Scene& s,float* out){
    SahBuilder tree(s);
    ck(cudaMemcpy(dt,s.triangles,size_t(s.triangle_count)*sizeof(Triangle),cudaMemcpyHostToDevice));
    ck(cudaMemcpy(dn,tree.nodes.data(),tree.nodes.size()*sizeof(Node),cudaMemcpyHostToDevice));
    ck(cudaMemcpy(di,tree.order.data(),tree.order.size()*sizeof(int),cudaMemcpyHostToDevice));
    Scene d=s;d.triangles=nullptr;Query q{dt,dn,di};int count=s.width*s.height*s.spp;
    int bs=512;
    for(int off=0;off<count;off+=262144){int end=std::min(count,off+262144);trace<<<(end-off+bs-1)/bs,bs>>>(d,q,dbuf,off,end);}
    average<<<(s.width*s.height+bs-1)/bs,bs>>>(d,dbuf,out);ck(cudaGetLastError());
}
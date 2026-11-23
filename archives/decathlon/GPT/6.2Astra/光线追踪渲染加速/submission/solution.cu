#include "render_math.cuh"
#include <cub/device/device_radix_sort.cuh>
#include <cub/device/device_scan.cuh>
#include <algorithm>
#include <climits>
using Vec=V<float>;
#define D __device__ __forceinline__
struct Box {float4 lo,hi;};
struct Tri {float4 a,b,c;};
struct Mat {float4 normal,col,tangent;};
struct Acc {Box* box;int2* child;Tri* tri;Mat* mat;int leaves,n;};
static Acc acc;
static cudaStream_t maskStream, mirrorStream;
static cudaEvent_t maskDone, mirrorDone;
static Triangle* raw;
static unsigned *keys,*sorted;
static int *order,*ids,*parent,*ready;
static void* scratch;
static size_t scratchBytes;
static float4 *tmp;
template<class T> static void alloc(T*& p,size_t n){cudaMalloc(&p,n*sizeof(T));}
D unsigned spread(unsigned a){
 a=(a|(a<<16))&0x030000ff;
 a=(a|(a<<8))&0x0300f00f;
 a=(a|(a<<4))&0x030c30c3;
 return (a|(a<<2))&0x09249249;
}
D Vec vv(float4 a){return Vec(a.x,a.y,a.z);}
D float4 cv(Vec v,float w=0){return make_float4(v.x,v.y,v.z,w);}
D Vec vmin(Vec a,Vec b){return Vec(fminf(a.x,b.x),fminf(a.y,b.y),fminf(a.z,b.z));}
D Vec vmax(Vec a,Vec b){return Vec(fmaxf(a.x,b.x),fmaxf(a.y,b.y),fmaxf(a.z,b.z));}
__global__ void morton(const Triangle* t,int n,unsigned* key,int* id,Vec low,Vec scale){
 int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=n)return;
 Vec a(t[i].v0),b(t[i].v1),c(t[i].v2);
 Vec p=((vmin(a,vmin(b,c))+vmax(a,vmax(b,c)))*.5f-low)*scale;
 key[i]=spread(min(1023u,(unsigned)fmaxf(0,p.x)))|(spread(min(1023u,(unsigned)fmaxf(0,p.y)))<<1)|(spread(min(1023u,(unsigned)fmaxf(0,p.z)))<<2);
 id[i]=i;
}
constexpr int G=2;
D int prefix(const unsigned* k,int i,int j,int L){
 if(j<0||j>=L)return -1;
 unsigned x=k[i*G]^k[j*G];return x?__clz(x):32+__clz(i^j);
}
__global__ void links(Acc a,const unsigned* k,int* par){
 int i=blockDim.x*blockIdx.x+threadIdx.x,L=a.leaves;if(i>=L-1)return;
 int dir=(prefix(k,i,i+1,L)>prefix(k,i,i-1,L))?1:-1;
 int low=prefix(k,i,i-dir,L),h=2;
 while(prefix(k,i,i+dir*h,L)>low)h*=2;
 int len=0;
 for(int s=h/2;s;s/=2)if(prefix(k,i,i+dir*(len+s),L)>low)len+=s;
 int j=i+len*dir,b=min(i,j),e=max(i,j),level=prefix(k,b,e,L),split=b;
 for(int s=h/2;s;s/=2)if(split+s<e&&prefix(k,b,split+s,L)>level)split+=s;
 int l=split==b?L-1+split:split,r=split+1==e?L+split:split+1;
 a.child[i]=make_int2(l,r);par[l]=par[r]=i;
}
__global__ void pack(Acc a,const Triangle* raw,const int* id){
 int i=blockDim.x*blockIdx.x+threadIdx.x;if(i>=a.leaves)return;
 Vec lo(1e30f,1e30f,1e30f),hi=lo*(-1.f);
 for(int j=i*G;j<min(a.n,(i+1)*G);j++){
  Triangle t=raw[id[j]];
  Vec v(t.v0),b(t.v1),c(t.v2),e=b-v,f=c-v;
  a.tri[j]={cv(v),cv(e),cv(f)};
  Vec normal=e.cross(f).unit(),axis=fabsf(normal.z)<.8f?Vec(0,0,1):Vec(0,1,0);
  a.mat[j]={cv(normal),cv(Vec(t.color),t.mirror),cv(axis.cross(normal).unit())};
  lo=vmin(lo,vmin(v,vmin(b,c)));hi=vmax(hi,vmax(v,vmax(b,c)));
 }
 Vec pad(1e-5f,1e-5f,1e-5f);
 a.box[i+a.leaves-1]={cv(lo-pad,1),cv(hi+pad)};
}
__global__ void bounds(Acc a,const int* par,int* ready){
 int i=blockDim.x*blockIdx.x+threadIdx.x;if(i>=a.leaves)return;
 int node=i+a.leaves-1;
 while(node){int p=par[node];if(atomicAdd(ready+p,1)==0)return;
  int2 c=a.child[p];Box b=a.box[c.x],f=a.box[c.y];
  a.box[p]={cv(vmin(vv(b.lo),vv(f.lo)),b.lo.w+f.lo.w),cv(vmax(vv(b.hi),vv(f.hi)))};
  __threadfence();node=p;
 }
}
D float recip(float x){return __frcp_rn(fabsf(x)<1e-30f?copysignf(1e-30f,x):x);}
D Vec inv(Vec d){return Vec(recip(d.x),recip(d.y),recip(d.z));}
D float slab(Box b,Vec o,Vec iv,float limit){
 Vec x=(vv(b.lo)-o)*iv,y=(vv(b.hi)-o)*iv;
 Vec l=vmin(x,y),h=vmax(x,y);
 float t=fmaxf(.0002f,fmaxf(l.x,fmaxf(l.y,l.z)));
 return t<=fminf(limit,fminf(h.x,fminf(h.y,h.z)))?t:1e30f;
}
D bool testTri(Tri t,Ray<float> r,float limit,float& dist){
 Vec e=vv(t.b),f=vv(t.c);
 Vec p=r.d.cross(f),s=r.o-vv(t.a),q=s.cross(e);
 float det=e.dot(p),iv=__frcp_rn(det),u=s.dot(p)*iv,v=r.d.dot(q)*iv;
 dist=f.dot(q)*iv;
 return fabsf(det)>=1e-10f&&u>=0&&u<=1&&v>=0&&u+v<=1&&dist>.0002f&&dist<limit;
}
template<bool any>
__device__ __noinline__ Hit<float> search(Acc a,Ray<float> r,float limit){
 int stack[72],sp=0,node=0,hit=-1;Vec iv=inv(r.d);
 for(;;){
  if(node<a.leaves-1){
   int2 ch=a.child[node];
   float l=slab(a.box[ch.x],r.o,iv,limit),h=slab(a.box[ch.y],r.o,iv,limit);
   if(l<=limit||h<=limit){
    bool left=l<=h;
    if(fmaxf(h,l)<=limit)stack[sp++]=left?ch.y:ch.x;
    node=left?ch.x:ch.y;continue;
   }
  }else{
   int b=(node-a.leaves+1)*G;
   for(int j=b;j<min(b+G,a.n);j++){float t;if(testTri(a.tri[j],r,limit,t)){hit=j;limit=t;if(any)return {t,j};}}
  }
  if(!sp)break;node=stack[--sp];
 }
 return {limit,hit};
}
D Vec fastunit(Vec v){return v*rsqrtf(v.dot(v));}
using DV=V<double>;
struct Projection {DV x,y,z,origin;int w,h;bool ortho;};
struct ProjTri {float4 e[3],depth;int4 rect;};
constexpr int TILE=1;
struct Atlas {int w,h;unsigned* z;int* count;int* ids;int* offset;int cap;};
struct Maps {Atlas cam,light;Projection cp,lp;};
static Maps maps;
static ProjTri *projected;
static int *largeIds,*numLarge;
static unsigned long long* workEstimate;
D DV dv(Vec a){return DV(a.x,a.y,a.z);}
D int clampBin(double v,int hi){return int(fmax(0.,fmin(double(hi),floor(v))));}
D double line(DV e,double x,double y){return e.x*x+e.y*y+e.z;}
__global__ void project(Acc a,Projection pr,ProjTri* out,int* large,int* nl,unsigned long long* work){
 int j=blockDim.x*blockIdx.x+threadIdx.x;if(j>=a.n)return;
 Tri tri=a.tri[j];DV v[3],p[3];v[0]=dv(vv(tri.a))-pr.origin;v[1]=v[0]+dv(vv(tri.b));v[2]=v[0]+dv(vv(tri.c));
 double z[3];for(int i=0;i<3;i++){z[i]=pr.z.dot(v[i]);p[i]=DV(pr.x.dot(v[i]),pr.y.dot(v[i]),pr.ortho?1.:z[i]);}
 ProjTri q;double loX=0,loY=0,hiX=pr.w,hiY=pr.h;
 if(pr.ortho||fmin(z[0],fmin(z[1],z[2]))>1e-9){
  loX=loY=1e60;hiX=hiY=-1e60;
  for(int i=0;i<3;i++){double x=p[i].x/p[i].z,y=p[i].y/p[i].z;
   loX=fmin(loX,x);hiX=fmax(hiX,x);loY=fmin(loY,y);hiY=fmax(hiY,y);}
 }else if(fmax(z[0],fmax(z[1],z[2]))<0){hiX=-1;}
 DV edge[3]={p[1].cross(p[2]),p[2].cross(p[0]),p[0].cross(p[1])};
 double det=edge[0].dot(p[0]);
 int4 rect=make_int4(clampBin(loX-.002,pr.w-1),clampBin(loY-.002,pr.h-1),clampBin(hiX+.002,pr.w-1),clampBin(hiY+.002,pr.h-1));
 if(hiX<-.002||hiY<-.002||loX>pr.w+.002||loY>pr.h+.002||fabs(det)<1e-28)rect.z=rect.x-1;
 DV depth;
 for(int i=0;i<3;i++){
  DV e=edge[i]*(1./det);
  depth=depth+e*(pr.ortho?z[i]:1.);
  // Shift linear functions to the middle of the cell. w bounds their variation.
  q.e[i]=make_float4(float(e.x),float(e.y),float(e.z+.5*(e.x+e.y)),float(.502*(fabs(e.x)+fabs(e.y))+2e-7*(fabs(e.z)+fabs(e.x)*pr.w+fabs(e.y)*pr.h)+1e-10));
 }
 DV n=dv(vv(tri.b)).cross(dv(vv(tri.c)));
 double hd=pr.ortho?fabs(n.dot(pr.z)):fabs(n.dot(v[0]));
 bool safe=pr.ortho?hd>1.1e-10:(hd>1.5e-8 && hd>2.1e-4*sqrt(n.dot(n)));
 if(pr.ortho&&hd<.99e-10)rect.z=rect.x-1;
 q.depth=make_float4(float(depth.x),float(depth.y),float(depth.z+.5*(depth.x+depth.y)+(pr.ortho?128.:0.)),float(.503*(fabs(depth.x)+fabs(depth.y))+3e-7*(fabs(depth.z)+fabs(depth.x)*pr.w+fabs(depth.y)*pr.h)+(pr.ortho?2e-5:1e-8)));
 if(!safe)q.depth.w=-q.depth.w;
 q.rect=rect;out[j]=q;
 int pixels=(rect.z-rect.x+1)*(rect.w-rect.y+1);
 if(pixels>256)atomicAdd(work,(unsigned long long)pixels);
 if(pixels>256)large[atomicAdd(nl,1)]=j;
}
template<int pass>
D void rasterCells(Atlas map,ProjTri q,int j,int begin,int step){
 int dx=q.rect.z-q.rect.x+1,n=dx*(q.rect.w-q.rect.y+1);
 for(int i=begin;i<n;i+=step){
  int x=i%dx+q.rect.x,y=i/dx+q.rect.y,bin=y*map.w+x;
  bool full=true,overlap=true;
  #pragma unroll
  for(int k=0;k<3;k++){float4 e=q.e[k];float d=fmaf(e.x,float(x),fmaf(e.y,float(y),e.z));
   overlap &= d>=-e.w;full &= d>=e.w;}
  float4 f=q.depth;float depth=fmaf(f.x,float(x),fmaf(f.y,float(y),f.z));
  if(pass){
   if(overlap && depth+fabsf(f.w)>=__uint_as_float(map.z[bin])){
    int slot=atomicAdd(map.count+bin,1);
    if(pass==2){
     int idx=map.offset[bin]+slot;
     if(unsigned(idx)<unsigned(map.cap))map.ids[idx]=full&&f.w>0?~j:j;
    }
   }
  }else if(full && f.w>=0 && depth>f.w){
   atomicMax(map.z+bin,__float_as_uint(depth-f.w));
  }
 }
}
template<int pass,bool big>
__global__ void raster(Atlas map,int n,const ProjTri* tris,const int* large,const int* nl){
 if(big){
  for(int i=blockIdx.x/16;i<*nl;i+=gridDim.x/16){
   int j=large[i];rasterCells<pass>(map,tris[j],j,threadIdx.x+(blockIdx.x%16)*blockDim.x,16*blockDim.x);
  }
 }else{
  int i=blockIdx.x*blockDim.x+threadIdx.x,j=i/16;
  if(j>=n)return;ProjTri q=tris[j];int size=(q.rect.z-q.rect.x+1)*(q.rect.w-q.rect.y+1);
  if(size<=256)rasterCells<pass>(map,q,j,i%16,16);
 }
}
static void* atlasBuf;static size_t atlasBytes;
static void makeMap(Acc a,Atlas& map,Projection proj){
 cudaMemset(map.z,0,sizeof(unsigned)*map.w*map.h);
 cudaMemset(map.count,0,sizeof(int)*map.w*map.h);
 cudaMemset(numLarge,0,sizeof(int));
 cudaMemset(workEstimate,0,8);
 project<<<(a.n+127)/128,128>>>(a,proj,projected,largeIds,numLarge,workEstimate);
 unsigned long long work;cudaMemcpy(&work,workEstimate,8,cudaMemcpyDeviceToHost);if(work>250000000ull){map.w=0;return;}
 raster<false,false><<<(a.n+7)/8,128>>>(map,a.n,projected,largeIds,numLarge);
 raster<false,true><<<1024,128>>>(map,a.n,projected,largeIds,numLarge);
 raster<true,false><<<(a.n+7)/8,128>>>(map,a.n,projected,largeIds,numLarge);
 raster<true,true><<<1024,128>>>(map,a.n,projected,largeIds,numLarge);
 cub::DeviceScan::ExclusiveSum(atlasBuf,atlasBytes,map.count,map.offset,map.w*map.h);
 cudaMemset(map.count,0,sizeof(int)*map.w*map.h);
 raster<2,false><<<(a.n+7)/8,128>>>(map,a.n,projected,largeIds,numLarge);
 raster<2,true><<<1024,128>>>(map,a.n,projected,largeIds,numLarge);
}
template<bool any>
D Hit<float> mapped(Acc a,Ray<float> r,Atlas map,int bin){
 int count=map.count[bin],id=-1;float limit=1e20f;
 if(!count)return {limit,-1};
 int offset=map.offset[bin];
 if(count>96||offset<0||offset+count>map.cap)return search<any>(a,r,limit);
 for(int k=0;k<count;k++){
  int j=map.ids[offset+k];float t;
  if(j<0){
   j=~j;Mat m=a.mat[j];Vec n=vv(m.normal);
   t=(vv(a.tri[j].a)-r.o).dot(n)*recip(r.d.dot(n));
   if(t>.0002f && (t<limit||(t==limit&&j<id))){id=j;limit=t;if(any)break;}
   continue;
  }
  if(testTri(a.tri[j],r,1e20f,t)&&(t<limit||(t==limit&&j<id))){limit=t;id=j;if(any)break;}
 }
 return {limit,id};
}
struct ViewMaps {Atlas cam,light;float4 x,y;};
D int shadowBin(ViewMaps m,Vec p){
 int x=__float2int_rd(p.dot(vv(m.x))+m.x.w),y=__float2int_rd(p.dot(vv(m.y))+m.y.w);
 return (unsigned(x)<unsigned(m.light.w)&&unsigned(y)<unsigned(m.light.h))?x+y*m.light.w:-1;
}
static ViewMaps setupMaps(const Scene& s,Acc a){
 DV u(s.u),v(s.v),w(s.w),z=u.cross(v);double det=w.dot(z);
 ViewMaps m{};
 if(fabs(det)>1e-20){
  z=z*(1./det);
  DV x=v.cross(w)*(1./det),y=w.cross(u)*(1./det);
  m.cam=maps.cam;m.cam.w=(s.width+TILE-1)/TILE;m.cam.h=(s.height+TILE-1)/TILE;
  Projection p{(x+z)*(.5*s.width/TILE),(z-y)*(.5*s.height/TILE),z,DV(s.eye),m.cam.w,m.cam.h,false};
  makeMap(a,m.cam,p);
 }
 DV l=DV(s.light).unit();
 DV sx=(fabs(l.z)<.8?DV(0,0,1):DV(0,1,0)).cross(l).unit(),sy=l.cross(sx);
 int side=maps.light.w;
 // The orthographic map covers the entire coordinate domain of the input.
 double scale=(side-2)/(2.*56.);
 DV o=(sx+sy)*(-side*.5/scale);
 Projection p{sx*scale,sy*scale,l,o,side,side,true};
 m.light=maps.light;m.x=make_float4(float(p.x.x),float(p.x.y),float(p.x.z),float(side*.5));
 m.y=make_float4(float(p.y.x),float(p.y.y),float(p.y.z),float(side*.5));
 makeMap(a,m.light,p);return m;
}
constexpr int SQ=2;
struct ShaftAxis {
 int nx,ny,nz,base;
 float x0,y0,z0;
};
struct Shafts {
 ShaftAxis ax[3];
 float iw,ih,w,h;
 int* count;int* offset;int* ids;int cap;
};
static Shafts shaftStorage;
static int shaftMax;
static void* shaftScan;
static size_t shaftBytes;
D int slotIndex(ShaftAxis a,int x,int y,int z,int dir){return a.base+(((z*SQ*SQ+dir)*a.ny+y)*a.nx+x);}
struct Clip {float x,y,z;};
template<bool emit>
__global__ void fillShafts(Acc a,Shafts g,int axis,int begin,int end){
 int th=blockIdx.x*blockDim.x+threadIdx.x,j=begin+th/32;
 if(j>=end)return;
 ShaftAxis m=g.ax[axis];Tri tri=a.tri[j];Vec p=vv(tri.a);
 int k=axis,kx=k==2?0:k+1,ky=k==0?2:k-1;
 Vec vv3[3]={p,p+vv(tri.b),p+vv(tri.c)};
 Clip v[3];
 for(int i=0;i<3;i++){Vec b=vv3[i];v[i]={b.at(kx)-m.x0,b.at(ky)-m.y0,(b.at(k)-m.z0)*g.ih};}
 int z0=max(0,__float2int_rd(fminf(v[0].z,fminf(v[1].z,v[2].z))-.0005f)),
 z1=min(m.nz-1,__float2int_rd(fmaxf(v[0].z,fmaxf(v[1].z,v[2].z))+.0005f));
 int dir=(th%32)/(32/(SQ*SQ)),lane=th%(32/(SQ*SQ));
 float sx=(2.f/SQ)*(dir%SQ+.5f)-1.f,sy=(2.f/SQ)*(dir/SQ+.5f)-1.f;
 for(int z=z0;z<=z1;z++){
  float lowx=1e30f,lowy=lowx,highx=-lowx,highy=-lowx;
  // Clip each of the three edges against the slab, then shear its endpoints.
  #pragma unroll
  for(int i=0;i<3;i++){
   Clip a0=v[i],b=v[(i+1)%3];float zmin=fminf(a0.z,b.z),zmax=fmaxf(a0.z,b.z);
   if(zmin>float(z+1)+.0005f||zmax<float(z)-.0005f)continue;
   float dz=b.z-a0.z;
   float t0=0,t1=1;
   if(fabsf(dz)>1e-12f){
    float v0=(float(z)-.0005f-a0.z)*recip(dz),v1=(float(z+1)+.0005f-a0.z)*recip(dz);
    t0=fmaxf(0,fminf(v0,v1));t1=fminf(1,fmaxf(v0,v1));
   }
   #pragma unroll
   for(int s=0;s<2;s++){float t=s?t1:t0;
    float zz=(fmaf(dz,t,a0.z)-(float(z)+.5f))*g.h;
    float x=fmaf(b.x-a0.x,t,a0.x)-sx*zz,y=fmaf(b.y-a0.y,t,a0.y)-sy*zz;
    float pad=fabsf(zz)*(1.f/SQ)+.00015f;
    lowx=fminf(lowx,x-pad);highx=fmaxf(highx,x+pad);lowy=fminf(lowy,y-pad);highy=fmaxf(highy,y+pad);
   }
  }
  if(lowx>highx)continue;
  int x0=max(0,__float2int_rd(lowx*g.iw)),x1=min(m.nx-1,__float2int_rd(highx*g.iw));
  int y0=max(0,__float2int_rd(lowy*g.iw)),y1=min(m.ny-1,__float2int_rd(highy*g.iw));
  int dx=x1-x0+1,dy=y1-y0+1;
  for(int i=lane;i<dx*dy;i+=32/(SQ*SQ)){
   int bin=slotIndex(m,x0+i%dx,y0+i/dx,z,dir);
   int off=atomicAdd(g.count+bin,1);
   if(emit){int idx=g.offset[bin]+off;if(unsigned(idx)<unsigned(g.cap))g.ids[idx]=j;}
  }
 }
}
__global__ void shaftCost(Acc a,Shafts g,unsigned long long* amount){
 int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=a.n)return;
 Tri t=a.tri[i];Vec e=vv(t.b),f=vv(t.c),b=vmax(Vec(),vmax(e,f))-vmin(Vec(),vmin(e,f));
 unsigned long long work=0;
 for(int k=0;k<3;k++){
  int x=(k+1)%3,y=(k+2)%3;
  work+=(unsigned long long)(2+b.at(k)*g.ih)*(unsigned)(2+(b.at(x)+g.h)*g.iw)*(unsigned)(2+(b.at(y)+g.h)*g.iw)*(SQ*SQ);
 }
 atomicAdd(amount,work);
}
static Shafts makeShafts(Acc a,float radius){
 Box root;cudaMemcpy(&root,a.box,sizeof(Box),cudaMemcpyDeviceToHost);
 Vec low(root.lo.x,root.lo.y,root.lo.z),hi(root.hi.x,root.hi.y,root.hi.z),size=hi-low;
 float longest=std::max({size.x,size.y,size.z,.01f});
 Shafts g=shaftStorage;g.h=std::max(longest/180.f,std::min(longest/40.f,radius*.30f));g.w=std::max(longest/300.f,radius*.21f);
 int total;
 for(;;){
  g.ih=1.f/g.h;g.iw=1.f/g.w;total=0;
  for(int z=0;z<3;z++){
   int x=(z+1)%3,y=(z+2)%3;
   ShaftAxis m;
   m.x0=low.at(x)-g.h;m.y0=low.at(y)-g.h;m.z0=low.at(z)-.512f*g.h;
   m.nx=int(ceil((size.at(x)+2*g.h)*g.iw))+1;m.ny=int(ceil((size.at(y)+2*g.h)*g.iw))+1;
   m.nz=int(ceil(size.at(z)*g.ih))+2;m.base=total;total+=m.nx*m.ny*m.nz*SQ*SQ;g.ax[z]=m;
  }
  if(total<=shaftMax)break;g.w*=1.12f;
 }
 cudaMemset(workEstimate,0,8);shaftCost<<<(a.n+127)/128,128>>>(a,g,workEstimate);
 unsigned long long work;cudaMemcpy(&work,workEstimate,8,cudaMemcpyDeviceToHost);if(work>900000000ull)return Shafts{};
 cudaMemset(g.count,0,total*sizeof(int));
 for(int k=0;k<3;k++)fillShafts<false><<<(a.n+3)/4,128>>>(a,g,k,0,a.n);
 cub::DeviceScan::ExclusiveSum(shaftScan,shaftBytes,g.count,g.offset,total);
 cudaMemset(g.count,0,total*sizeof(int));
 for(int k=0;k<3;k++)fillShafts<true><<<(a.n+3)/4,128>>>(a,g,k,0,a.n);
 return g;
}
constexpr int FQ=4,FB=8,FBITS=4*FQ*FB+2*FB;
struct SGroup {int bin,off,count;};
struct SFilter {int4* headers;int* size;SGroup* groups;unsigned* tab;int cap;};
static SFilter filter;
__global__ void assignS(Shafts g,SFilter f,int total){
 int i=blockDim.x*blockIdx.x+threadIdx.x;if(i>=total)return;
 int cnt=g.count[i],base=-1;
 if(cnt>=3&&cnt<=2048&&g.offset[i]+cnt<=g.cap){
  int num=(cnt+31)/32;base=atomicAdd(f.size,num);if(base+num>f.cap)base=-1;
  else for(int j=0;j<num;j++)f.groups[base+j]={i,g.offset[i]+32*j,min(32,cnt-32*j)};
 }f.headers[i]=make_int4(g.offset[i],cnt,base,0);
}
__global__ void fineS(Acc a,Shafts g,SFilter f,int total){
 int i=blockIdx.x*blockDim.x+threadIdx.x,lane=i&31,job=i/32,idx=job/FQ;
 if(idx>=total)return;
 SGroup sg=f.groups[idx];int bin=sg.bin,k=(bin>=g.ax[2].base)?2:(bin>=g.ax[1].base)?1:0;
 ShaftAxis m=k==0?g.ax[0]:k==1?g.ax[1]:g.ax[2];int q=job%FQ,b=bin-m.base,x=b%m.nx,y=b/m.nx%m.ny,jz=b/(m.nx*m.ny),dir=jz%(SQ*SQ),z=jz/(SQ*SQ);
 int ux=k==2?0:k+1,uy=k==0?2:k-1;
 int id=g.ids[sg.off+min(lane,sg.count-1)];
 Tri t=a.tri[id];Vec p=vv(t.a),vv3[3]={p,p+vv(t.b),p+vv(t.c)};
 float sx=((dir%SQ)*FQ+q+.5f)*(2.f/(SQ*FQ))-1,sy=((dir/SQ)*FQ+q+.5f)*(2.f/(SQ*FQ))-1;
 float lx=1e20f,ly=lx,hx=-lx,hy=-lx,lz=lx,hz=-lx,lu=lx,lv=lx,hu=-lx,hv=-lx;
 float csx=(dir%SQ+.5f)*(2.f/SQ)-1.f,csy=(dir/SQ+.5f)*(2.f/SQ)-1.f;
 float ds=(2.f*(q+.5f)/FQ-1.f)/SQ,su=.5f*(csx+csy)+ds,sv=.5f*(csx-csy)+ds;
 Clip v[3];
 for(int i=0;i<3;i++){Vec w=vv3[i];v[i]={(w.at(ux)-m.x0)*g.iw-x,(w.at(uy)-m.y0)*g.iw-y,(w.at(k)-m.z0)*g.ih-z};}
 #pragma unroll
 for(int j=0;j<3;j++){
  Clip v0=v[j],v1=v[(j+1)%3];float dz=v1.z-v0.z;
  if(fminf(v0.z,v1.z)>1.0005f||fmaxf(v0.z,v1.z)<-.0005f)continue;
  float t0=0,t1=1;
  if(fabsf(dz)>1e-12f){
   float a=(-.0005f-v0.z)*recip(dz),b=(1.0005f-v0.z)*recip(dz);
   t0=fmaxf(0,fminf(a,b));t1=fminf(1,fmaxf(a,b));
  }
  #pragma unroll
  for(int h=0;h<2;h++){
   float tt=h?t1:t0,zz=fmaf(dz,tt,v0.z),shift=(zz-.5f)*(g.h*g.iw);
   float x=fmaf(v1.x-v0.x,tt,v0.x)-sx*shift,y=fmaf(v1.y-v0.y,tt,v0.y)-sy*shift;
   float gx=fmaf(v1.x-v0.x,tt,v0.x),gy=fmaf(v1.y-v0.y,tt,v0.y);
   float u=.5f*(gx+gy)-su*shift,v=.5f*(gx-gy+1.f)-sv*shift;
   float pad=(fabsf(shift)/(FQ*SQ))+.0008f;lu=fminf(lu,u-pad);hu=fmaxf(hu,u+pad);lv=fminf(lv,v-pad);hv=fmaxf(hv,v+pad);
   lx=fminf(lx,x-pad);hx=fmaxf(hx,x+pad);ly=fminf(ly,y-pad);hy=fmaxf(hy,y+pad);lz=fminf(lz,zz-.0005f);hz=fmaxf(hz,zz+.0005f);
  }
 }
 unsigned mx=0,my=0,mu=0,mv=0,mz0=0,mz1=0;bool active=lane<sg.count;
 #pragma unroll
 for(int b=0;b<FB;b++){
  unsigned a=__ballot_sync(~0u,active&&lx*FB<=b+1&&hx*FB>=b),c=__ballot_sync(~0u,active&&ly*FB<=b+1&&hy*FB>=b);
  unsigned e=__ballot_sync(~0u,active&&lz*FB<=b+1),f=__ballot_sync(~0u,active&&hz*FB>=b);
  unsigned u=__ballot_sync(~0u,active&&lu*FB<=b+1&&hu*FB>=b),v=__ballot_sync(~0u,active&&lv*FB<=b+1&&hv*FB>=b);
  if(lane==b){mx=a;my=c;mu=u;mv=v;mz0=e;mz1=f;}
 }
 if(lane<FB){
  unsigned* ptr=f.tab+idx*FBITS;ptr[q*FB+lane]=mx;ptr[(FQ+q)*FB+lane]=my;
  ptr[(2*FQ+q)*FB+lane]=mu;ptr[(3*FQ+q)*FB+lane]=mv;
  if(q==0){ptr[4*FQ*FB+lane]=mz0;ptr[(4*FQ+1)*FB+lane]=mz1;}
 }
}
static void buildSFilter(Acc a,Shafts g){
 auto m=g.ax[2];int total=m.base+m.nx*m.ny*m.nz*SQ*SQ;
 cudaMemset(filter.size,0,4);
 assignS<<<(total+127)/128,128>>>(g,filter,total);
 int ng;cudaMemcpy(&ng,filter.size,4,cudaMemcpyDeviceToHost);ng=std::min(ng,filter.cap);
 if(ng)fineS<<<(ng*FQ+3)/4,128,0,maskStream>>>(a,g,filter,ng);cudaEventRecord(maskDone,maskStream);
}
D int fineBin(float x){return max(0,min(FB-1,__float2int_rd(x*FB)));}
D bool shaftBlocked(Acc a,Shafts g,SFilter filter,Ray<float> r,float limit){
 Vec d=r.d,p=r.o;
 int k=fabsf(d.x)>fabsf(d.y)&&fabsf(d.x)>fabsf(d.z)?0:fabsf(d.y)>fabsf(d.z)?1:2;
 int x=k==2?0:k+1,y=k==0?2:k-1;
 ShaftAxis m=k==0?g.ax[0]:k==1?g.ax[1]:g.ax[2];
 float dz=d.at(k),iv=recip(dz),sx=d.at(x)*iv,sy=d.at(y)*iv;
 int u=min(SQ-1,max(0,__float2int_rd((sx+1)*(SQ*.5f)))),v=min(SQ-1,max(0,__float2int_rd((sy+1)*(SQ*.5f))));
 int dir=u+v*SQ;
 int qu=min(SQ*FQ-1,max(0,__float2int_rd((sx+1.f)*(.5f*SQ*FQ))))%FQ;
 int qv=min(SQ*FQ-1,max(0,__float2int_rd((sy+1.f)*(.5f*SQ*FQ))))%FQ;
 float rx=(sx+1.f)*(.5f*SQ)-u,ry=(sy+1.f)*(.5f*SQ)-v;
 int qsum=min(FQ-1,max(0,__float2int_rd((rx+ry)*(.5f*FQ))));
 int qdiff=min(FQ-1,max(0,__float2int_rd((rx-ry+1.f)*(.5f*FQ))));
 float z0=(p.at(k)-m.z0)*g.ih,step=dz*g.ih;
 int first=__float2int_rd(z0+step*.0002f),last=__float2int_rd(z0+step*limit);
 int inc=dz>=0?1:-1;
 if(max(first,last)<0||min(first,last)>=m.nz)return false;
 first=min(m.nz-1,max(0,first));last=min(m.nz-1,max(0,last));
 float ox=(p.at(x)-m.x0)*g.iw,oy=(p.at(y)-m.y0)*g.iw;
 float stepx=sx*(g.h*g.iw),stepy=sy*(g.h*g.iw);
 for(int z=first;;z+=inc){
  float shift=(z+.5f)-z0;
  float fx=fmaf(stepx,shift,ox),fy=fmaf(stepy,shift,oy);int ix=__float2int_rd(fx),iy=__float2int_rd(fy);
  if((unsigned)ix<(unsigned)m.nx && (unsigned)iy<(unsigned)m.ny){
   int bin=slotIndex(m,ix,iy,z,dir);int4 hdr=filter.headers[bin];int cnt=hdr.y,off=hdr.x,base=hdr.z;if(base>=0){
    int xf=qu*FB+fineBin(fx-ix),yf=(FQ+qv)*FB+fineBin(fy-iy);
    float za=z0-z,zb=za+step*limit;
    int uf=(2*FQ+qsum)*FB+fineBin(.5f*((fx-ix)+(fy-iy))),vf=(3*FQ+qdiff)*FB+fineBin(.5f*((fx-ix)-(fy-iy)+1));
    int zl=(4*FQ+1)*FB+fineBin(fminf(za,zb)),zh=4*FQ*FB+fineBin(fmaxf(za,zb));
    unsigned* ptr=filter.tab+base*FBITS;
    for(int k=0;k<cnt;k+=32,ptr+=FBITS){
     unsigned bits=ptr[xf]&ptr[yf]&ptr[uf]&ptr[vf]&ptr[zl]&ptr[zh];
     while(bits){int b=__ffs(bits)-1;bits&=bits-1;float t;
      if(testTri(a.tri[g.ids[off+k+b]],r,limit,t))return true;
     }
    }
   }else{if(cnt>75||off<0||off+cnt>g.cap)return search<true>(a,r,limit).id>=0;
   for(int i=0;i<cnt;i++){int j=g.ids[off+i];float h;if(testTri(a.tri[j],r,limit,h))return true;}}
  }
  if(z==last)break;
 }
 return false;
}
D Vec fabs3(Vec v){return Vec(fabsf(v.x),fabsf(v.y),fabsf(v.z));}
D Vec reflectDir(Vec d,Vec n){return d-n*(2*d.dot(n));}
struct Cone {Vec o,d,dx,dy,n,v;float t0,limit;};
D float boundEdge(Vec edge,Cone c){
 return fabsf(edge.dot(c.dx))+fabsf(edge.dot(c.dy))+fabs3(edge).dot(fabs3(c.d))*.000002f+1e-15f;
}
D int inCone(Tri tri,Cone c,float& low,float& high){
 Vec a=vv(tri.a),b=vv(tri.b),f=vv(tri.c),s=c.o-a;
 float h=(a-c.v).dot(c.n),hb=h+b.dot(c.n),hc=h+f.dot(c.n);
 if(fmaxf(h,fmaxf(hb,hc))<.00094f)return -1;
 Vec e1=f.cross(s),e2=s.cross(b),en=f.cross(b),e3=en-e1-e2;
 float tn=f.dot(e2),sg=copysignf(1.f,tn);
 float cd=sg*en.dot(c.d),de=boundEdge(en,c);
 if(cd+de<=0)return -1;
 low=fabsf(tn)/(cd+de)-.0002f;
 high=(cd>de)?fabsf(tn)/(cd-de)+.0002f:1e25f;
 if(low>=c.limit||high<=c.t0)return -1;
 float u=sg*e1.dot(c.d),v=sg*e2.dot(c.d),w=sg*e3.dot(c.d);
 float er1=boundEdge(e1,c),er2=boundEdge(e2,c),er3=boundEdge(e3,c);
 // Arithmetic and geometric offsets also bound the difference between
 // reflecting an intersection and tracing from the reflected eye.
 float extra=2e-5f*(fabs3(b).x+fabs3(b).y+fabs3(b).z+fabs3(f).x+fabs3(f).y+fabs3(f).z);
 er1+=extra;er2+=extra;er3+=extra;
 if(u< -er1||v< -er2||w< -er3)return -1;
 return u>er1&&v>er2&&w>er3&&fminf(h,fminf(hb,hc))>.00125f&&cd-de>2e-10f?1:0;
}
D float coneSlab(Box box,Cone c,Vec iv,Vec rd){
 Vec lo=vv(box.lo),hi=vv(box.hi),p=c.o;
 Vec delta=vmax(fabs3(lo-p),fabs3(hi-p));
 float upper=fminf(c.limit,1.8f*fmaxf(delta.x,fmaxf(delta.y,delta.z))+.001f);
 Vec pad=rd*upper+Vec(.0001f,.0001f,.0001f);
 Vec x=(lo-pad-p)*iv,y=(hi+pad-p)*iv,l=vmin(x,y),u=vmax(x,y);
 float t=fmaxf(c.t0,fmaxf(l.x,fmaxf(l.y,l.z)));
 return t<=fminf(c.limit,fminf(u.x,fminf(u.y,u.z)))?t:1e30f;
}
constexpr int MTILE=8,COARSE=256,FINE=12;
struct MirrorRect {int x0,y0,x1,y1,nx,base;};
struct MirrorJob {int tri,x,y,n;int ids[COARSE];};
struct MirrorPixel {int n,ids[FINE];};
struct Mirrors {MirrorRect* rect;MirrorJob* jobs;MirrorPixel* pixels;int* num;int cap;};
static Mirrors mirrorStorage;
__global__ void initRect(Mirrors m,int n){int i=blockIdx.x*blockDim.x+threadIdx.x;if(i<n)m.rect[i]={99999,99999,-1,-1,0,-1};}
__global__ void markRect(Scene s,Acc a,Atlas cam,Mirrors m){
 int p=blockIdx.x*blockDim.x+threadIdx.x;if(p>=cam.w*cam.h)return;int cnt=cam.count[p],off=cam.offset[p];
 if(cnt>96||unsigned(off+cnt)>unsigned(cam.cap))return;
 for(int it=0;it<cnt;it++){int j=cam.ids[off+it];if(j<0)j=~j;if(a.mat[j].col.w>0){
  MirrorRect& r=m.rect[j];int x=p%cam.w,y=p/cam.w;
  atomicMin(&r.x0,x);atomicMin(&r.y0,y);atomicMax(&r.x1,x);atomicMax(&r.y1,y);
 }}
}
__global__ void initJobs(Mirrors m,int n){
 int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=n)return;MirrorRect r=m.rect[i];if(r.x1<0)return;
 int nx=(r.x1-r.x0)/MTILE+1,ny=(r.y1-r.y0)/MTILE+1,num=nx*ny;
 int base=atomicAdd(m.num,0);
 for(;;){if(base>m.cap)return;int next=min(m.cap+1,base+num);
  int seen=atomicCAS(m.num,base,next);if(seen==base)break;base=seen;
 }
 if(base+num>m.cap)return;
 m.rect[i].nx=nx;m.rect[i].base=base;
 for(int k=0;k<num;k++){
  MirrorJob& j=m.jobs[base+k];j.tri=i;j.x=r.x0+k%nx*MTILE;j.y=r.y0+k/nx*MTILE;j.n=-1;
 }
}
D Cone jobCone(Scene s,Acc a,MirrorJob& j){
 int mirror=j.tri;Vec n=vv(a.mat[mirror].normal),v=vv(a.tri[mirror].a),eye(s.eye);
 if(n.dot(eye-v)<0)n=n*(-1.f);
 Cone c;c.o=eye+n*(.001f-2*(eye-v).dot(n));c.n=n;c.v=v;
 Vec raw=Vec(s.w)+Vec(s.u)*((j.x+.5f*MTILE)/s.width*2-1)+Vec(s.v)*(1-(j.y+.5f*MTILE)/s.height*2);
 float scale=rsqrtf(raw.dot(raw));
 c.d=reflectDir(raw,n)*scale;
 c.dx=reflectDir(Vec(s.u),n)*(scale*MTILE/s.width);c.dy=reflectDir(Vec(s.v),n)*(-scale*MTILE/s.height);
 float h=(v-c.o).dot(n)+.0009f,rate=c.d.dot(n)+boundEdge(n,c);
 c.t0=fmaxf(0,h/fmaxf(1e-10f,rate)-.0002f);c.limit=1e20f;return c;
}
struct Eqs {float4 e[3],depth;};
D float4 makeEq(Vec v,Cone c,float extra){
 float x=v.dot(c.dx),y=v.dot(c.dy),e=(fabsf(x)+fabsf(y))/MTILE+fabs3(v).dot(fabs3(c.d))*2e-6f+extra+1e-15f;
 return make_float4(x,y,v.dot(c.d),e);
}
D Eqs mirrorEq(Tri t,Cone c){
 Vec b=vv(t.b),f=vv(t.c),s=c.o-vv(t.a);
 Vec eu=f.cross(s),ev=s.cross(b),en=f.cross(b);
 float tn=f.dot(ev),sg=copysignf(1.f,tn),extra=2e-5f*(fabs3(b)+fabs3(f)).dot(Vec(1,1,1));
 Eqs q;q.e[0]=makeEq(eu*sg,c,extra);q.e[1]=makeEq(ev*sg,c,extra);q.e[2]=makeEq((en-eu-ev)*sg,c,extra);
 float h=(vv(t.a)-c.v).dot(c.n);
 q.depth=makeEq(en*(sg/fmaxf(1e-30f,fabsf(tn))),c,0);
 if(fminf(h,fminf(h+b.dot(c.n),h+f.dot(c.n)))<=.00125f||fabsf(tn)<1.2e-8f)q.depth.w=-q.depth.w;
 return q;
}
D float evalEq(float4 q,float x,float y){return fmaf(q.x,x,fmaf(q.y,y,q.z));}
__global__ void fineJobs(Scene s,Acc a,Mirrors m,int start){
 int i=start+blockIdx.x,tid=threadIdx.x;MirrorJob& job=m.jobs[i];
 MirrorPixel& rec=m.pixels[i*(MTILE*MTILE)+tid];
 int cnt=job.n;if(cnt<0){rec.n=-1;return;}
 __shared__ float4 eq[4][COARSE];Cone c=jobCone(s,a,job);
 for(int j=tid;j<cnt;j+=blockDim.x){
  Eqs e=mirrorEq(a.tri[job.ids[j]],c);for(int k=0;k<3;k++)eq[k][j]=e.e[k];eq[3][j]=e.depth;
 }
 __syncthreads();
 float x=(tid%MTILE+.5f)*(2.f/MTILE)-1,y=(tid/MTILE+.5f)*(2.f/MTILE)-1;
 float lim=0;int n=0;
 for(int j=0;j<cnt;j++){
  float4 ed=eq[3][j];if(ed.w<=0)continue;float lower=evalEq(ed,x,y)-ed.w;
  if(lower<=lim)continue;bool inside=true;
  for(int k=0;k<3;k++){float4 e=eq[k][j];inside&=evalEq(e,x,y)>e.w;}
  if(inside)lim=lower;
 }
 for(int j=0;j<cnt;j++){
  float4 ed=eq[3][j];
  if(evalEq(ed,x,y)+fabsf(ed.w)<lim-1e-6f*fabsf(lim))continue;bool hit=true;
  for(int k=0;k<3;k++){float4 e=eq[k][j];hit&=evalEq(e,x,y)>=-e.w;}
  if(hit){if(n==FINE){rec.n=-1;return;}rec.ids[n++]=job.ids[j];}
 }
 rec.n=n;
}
struct Cluster {Box bounds;int root;};
static Cluster* clusters;
static int* clusterCount;
__global__ void collectClusters(Acc a,const int* parent,Cluster* cut,int* count){
 int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=2*a.leaves-1)return;
 int cap=max(2,a.leaves/80);
 if(a.box[i].lo.w<=cap&&(i==0||a.box[parent[i]].lo.w>cap)){
  int idx=atomicAdd(count,1);cut[idx]={a.box[i],i};
 }
}
__global__ void clusterJobs(Scene s,Acc a,Mirrors m,const Cluster* cut,int ncut,int start){
 int idx=start+blockIdx.x,tid=threadIdx.x;MirrorJob& j=m.jobs[idx];Cone c=jobCone(s,a,j);
 if(sqrtf(c.dx.dot(c.dx))+sqrtf(c.dy.dot(c.dy))>.02f){if(!tid)j.n=-1;return;}
 Vec iv=inv(c.d),rd=fabs3(c.dx)+fabs3(c.dy)+Vec(2e-6f,2e-6f,2e-6f);
 __shared__ int size;__shared__ unsigned maxdist;
 if(!tid){size=0;maxdist=__float_as_uint(1e20f);}
 __syncthreads();
 for(int q=tid;q<ncut;q+=blockDim.x){
  int node=cut[q].root,stack[64],sp=0;c.limit=__uint_as_float(maxdist);
  if(coneSlab(cut[q].bounds,c,iv,rd)>c.limit)continue;
  while(true){
   if(node<a.leaves-1){
    int2 ch=a.child[node];float l=coneSlab(a.box[ch.x],c,iv,rd),r=coneSlab(a.box[ch.y],c,iv,rd);
    if(fminf(l,r)<=c.limit){
     bool left=l<=r;if(fmaxf(l,r)<=c.limit)stack[sp++]=left?ch.y:ch.x;node=left?ch.x:ch.y;continue;
    }
   }else{
    int b=(node-a.leaves+1)*G;
    for(int it=b;it<min(b+G,a.n);it++){
     float lo,hi;int cov=inCone(a.tri[it],c,lo,hi);
     if(cov<0)continue;if(cov&&hi<c.limit){atomicMin(&maxdist,__float_as_uint(hi));c.limit=__uint_as_float(maxdist);}
     int slot=atomicAdd(&size,1);if(slot<COARSE)j.ids[slot]=it;else break;
    }
   }
   if(!sp||size>COARSE)break;node=stack[--sp];
  }
 }
 __syncthreads();if(!tid)j.n=size>COARSE?-1:size;
}
static Mirrors buildMirrors(Scene s,Acc a,Atlas cam){
 Mirrors m=mirrorStorage;cudaMemset(m.num,0,4);
 initRect<<<(a.n+127)/128,128>>>(m,a.n);
 markRect<<<(cam.w*cam.h+127)/128,128>>>(s,a,cam,m);
 initJobs<<<(a.n+127)/128,128>>>(m,a.n);
 int n;cudaMemcpy(&n,m.num,4,cudaMemcpyDeviceToHost);
 if(n>m.cap)return Mirrors{};
 cudaMemset(clusterCount,0,4);collectClusters<<<(2*a.leaves+126)/128,128>>>(a,parent,clusters,clusterCount);
 int nc;cudaMemcpy(&nc,clusterCount,4,cudaMemcpyDeviceToHost);
 for(int p=0;p<n;p+=4096)clusterJobs<<<std::min(n-p,4096),128,0,mirrorStream>>>(s,a,m,clusters,nc,p);
 for(int p=0;p<n;p+=8192)fineJobs<<<std::min(n-p,8192),MTILE*MTILE,0,mirrorStream>>>(s,a,m,p);
 cudaEventRecord(mirrorDone,mirrorStream);return m;
}
D Hit<float> mirrorHit(Acc a,Ray<float> r,Mirrors m,int id,int x,int y){
 MirrorRect rect=m.rect[id];
 x-=rect.x0;y-=rect.y0;
 if(rect.base>=0&&unsigned(x)<=unsigned(rect.x1-rect.x0)&&unsigned(y)<=unsigned(rect.y1-rect.y0)){
  int j=rect.base+x/MTILE+y/MTILE*rect.nx;const MirrorPixel& rec=m.pixels[j*MTILE*MTILE+(y%MTILE)*MTILE+x%MTILE];
  if(rec.n>=0){
   Hit<float> h{1e20f,-1};
   for(int i=0;i<rec.n;i++){int it=rec.ids[i];float t;if(testTri(a.tri[it],r,1e20f,t)&&(t<h.t||(t==h.t&&it<h.id)))h={t,it};}
   return h;
  }
 }
 return search<false>(a,r,1e20f);
}
template<int NAO>
D Vec shade(Scene s,Acc a,ViewMaps maps,Shafts g,SFilter filter,Mirrors ref,int px,int sid){
 Ray<float> r=camera<float>(s,px,sid);Vec col;float wt=1;
 unsigned key=s.seed+unsigned(px)*0x9e3779b9u+unsigned(sid)*0x85ebca6bu;
 int last=-1;
 for(int dep=0;dep<s.max_depth;dep++,key+=0xc2b2ae35u){
  auto h=(!dep&&maps.cam.w)?mapped<false>(a,r,maps.cam,px%s.width/TILE+px/s.width/TILE*maps.cam.w):(dep==1&&ref.rect?mirrorHit(a,r,ref,last,px%s.width,px/s.width):search<false>(a,r,1e20f));last=h.id;
  if(h.id<0){col=col+sky(r.d)*wt;break;}
  Mat m=a.mat[h.id];Vec n=vv(m.normal);
  if(n.dot(r.d)>0)n=n*(-1.f);
  Vec p=r.o+r.d*h.t+n*.001f,l=fastunit(Vec(s.light));
  float mirror=m.col.w;
  {
   float cos=fmaxf(0,n.dot(l));
   if(cos>0){int bin=maps.light.w?shadowBin(maps,p):-1;
    if((bin>=0?mapped<true>(a,{p,l},maps.light,bin):search<true>(a,{p,l},1e20f)).id>=0)cos=0;}
   int open=0;
   Vec axis=fabsf(n.z)<.8f?Vec(0,0,1):Vec(0,1,0);
   Vec tx=fastunit(axis.cross(n)),ty=n.cross(tx);
   for(int i=0;i<(NAO>=0?NAO:s.ao);i++){
    unsigned k=key+unsigned(i)*0x27d4eb2du;
    float x=2*sample<float>(k^0x68bc21ebu)-1,y=2*sample<float>(k^0x02e5be93u)-1,z=.25f+.75f*sample<float>(k^0x967a889bu);
    Vec d=fastunit(tx*x+ty*y+n*z);
    open+=!(g.ih?shaftBlocked(a,g,filter,{p,d},s.ao_radius):search<true>(a,{p,d},s.ao_radius).id>=0);
   }
   float value=.08f+.20f*(NAO==1?float(open):s.ao?float(open)/s.ao:1.f)+.72f*cos;
   col=col+vv(m.col)*(wt*(1-mirror)*value);
  }
  if(mirror==0)break;wt*=mirror;r={p,fastunit(r.d-n*(2*r.d.dot(n)))};
 }
 return col;
}
__global__ void trace(Scene s,Acc a,ViewMaps maps,Shafts g,SFilter filter,Mirrors ref,float4* out,int off,int count){
 int i=blockDim.x*blockIdx.x+threadIdx.x;if(i>=count)return;
 int idx=i+off;out[i]=cv(shade<-1>(s,a,maps,g,filter,ref,idx/s.spp,idx%s.spp));
}
template<int lanes,int NAO>
__global__ void fused(Scene s,Acc a,ViewMaps m,Shafts g,SFilter filter,Mirrors ref,float* out,int start,int end){
 constexpr int pixels=128/lanes;
 int px=start+blockIdx.x*pixels+threadIdx.x/lanes,lane=threadIdx.x%lanes;
 Vec c;
 if(px<end && lane<s.spp)c=shade<NAO>(s,a,m,g,filter,ref,px,lane);
 for(int i=16;i;i/=2){
  c.x+=__shfl_down_sync(0xffffffff,c.x,i);
  c.y+=__shfl_down_sync(0xffffffff,c.y,i);
  c.z+=__shfl_down_sync(0xffffffff,c.z,i);
 }
 __shared__ float3 half[4];
 if((threadIdx.x&31)==0)half[threadIdx.x/32]=make_float3(c.x,c.y,c.z);
 __syncthreads();
 if(!lane&&px<end){
  #pragma unroll
  for(int j=1;j<lanes/32;j++){float3 h=half[threadIdx.x/32+j];c=c+Vec(h.x,h.y,h.z);}
  c=c*(1.f/s.spp);out[3*px]=c.x;out[3*px+1]=c.y;out[3*px+2]=c.z;
 }
}
__global__ void sum(Scene s,float4* tmp,float* out,int start,int pix){
 int p=blockDim.x*blockIdx.x+threadIdx.x;if(p>=pix)return;
 Vec c;for(int j=0;j<s.spp;j++)c=c+vv(tmp[p*s.spp+j]);
 c=c*(1.f/s.spp);int i=3*(start+p);out[i]=c.x;out[i+1]=c.y;out[i+2]=c.z;
}
constexpr int STREAM=524288;
static int *pixelList,*pixelCounts;
static Hit<float>* pathState;
__global__ void splitPixels(Scene s,Acc a,Atlas map,int* keys,int* counts){
 int p=blockIdx.x*blockDim.x+threadIdx.x,np=s.width*s.height;if(p>=np)return;
 int cnt=map.count[p],off=map.offset[p];
 bool mirror=cnt>96||unsigned(off+cnt)>unsigned(map.cap);
 if(!mirror&&s.max_depth>1)for(int i=0;i<cnt;i++){
  int j=map.ids[off+i];if(a.mat[j<0?~j:j].col.w>0){mirror=true;break;}
 }
 if(!cnt){keys[2*np+atomicAdd(counts+2,1)]=p;}
 else if(mirror&&s.max_depth>1){keys[np+atomicAdd(counts+1,1)]=p;}
 else keys[atomicAdd(counts,1)]=p;
}
D Vec lit(Scene s,Acc a,ViewMaps maps,Shafts g,SFilter filter,Mat m,Vec n,Vec p,Vec l,unsigned key,float wt,bool flip){
 float cos=fmaxf(0,n.dot(l));
 if(cos>0){int bin=shadowBin(maps,p);
  if((bin>=0?mapped<true>(a,{p,l},maps.light,bin):search<true>(a,{p,l},1e20f)).id>=0)cos=0;}
 Vec tx=vv(m.tangent)*(flip?-1.f:1.f),ty=n.cross(tx);
 float x=2*sample<float>(key^0x68bc21ebu)-1,y=2*sample<float>(key^0x02e5be93u)-1,z=.25f+.75f*sample<float>(key^0x967a889bu);
 Vec d=fastunit(tx*x+ty*y+n*z);
 bool occluded=shaftBlocked(a,g,filter,{p,d},s.ao_radius);
 return vv(m.col)*(wt*(1-m.col.w)*(.08f+.20f*float(!occluded)+.72f*cos));
}
__device__ __noinline__ Vec remainingBounces(Scene s,Acc a,ViewMaps m,Shafts g,SFilter f,Ray<float> r,Hit<float> h,float wt,unsigned key){
 Vec col,l=fastunit(Vec(s.light));
 for(int depth=2;depth<s.max_depth;depth++){
  Mat last=a.mat[h.id];Vec n=vv(last.normal);if(n.dot(r.d)>0)n=n*(-1.f);
  wt*=last.col.w;r={r.o+r.d*h.t+n*.001f,fastunit(r.d-n*(2*r.d.dot(n)))};
  h=search<false>(a,r,1e20f);
  if(h.id<0)return col+sky(r.d)*wt;
  Mat mat=a.mat[h.id];n=vv(mat.normal);bool flip=n.dot(r.d)>0;if(flip)n=n*(-1.f);
  key+=0xc2b2ae35u;col=col+lit(s,a,m,g,f,mat,n,r.o+r.d*h.t+n*.001f,l,key,wt,flip);
  if(mat.col.w==0)break;
 }return col;
}
template<int phase>
__global__ __launch_bounds__(128,8) void wave(Scene s,Acc a,ViewMaps m,Shafts g,SFilter f,Mirrors mirror,const int* pixels,Hit<float>* state,float* out,int np){
 int lane=threadIdx.x%64,pi=blockIdx.x*2+threadIdx.x/64;
 int px=pi<np?pixels[pi]:0;Vec col;
 if(pi<np&&lane<s.spp){
  Ray<float> r=camera<float>(s,px,lane);unsigned key=s.seed+unsigned(px)*0x9e3779b9u+unsigned(lane)*0x85ebca6bu;
  if(phase==3)col=sky(r.d);
  else if(phase<=1){
   Hit<float> h=mapped<false>(a,r,m.cam,px);
   if(h.id<0)col=sky(r.d);
   else{
    Mat mat=a.mat[h.id];Vec n=vv(mat.normal);bool flip=n.dot(r.d)>0;if(flip)n=n*(-1.f);
    col=lit(s,a,m,g,f,mat,n,r.o+r.d*h.t+n*.001f,fastunit(Vec(s.light)),key,1.f,flip);
    if(phase==1&&mat.col.w==0)h.id=-1;
   }
   if(phase==1)state[pi*64+lane]=h;
  }else{
   Hit<float> h=state[pi*64+lane];float wt=1;Vec l=fastunit(Vec(s.light));
   if(h.id>=0){
    Mat prev=a.mat[h.id];Vec n=vv(prev.normal);if(n.dot(r.d)>0)n=n*(-1.f);
    wt=prev.col.w;r={r.o+r.d*h.t+n*.001f,fastunit(r.d-n*(2*r.d.dot(n)))};
    h=mirror.rect?mirrorHit(a,r,mirror,h.id,px%s.width,px/s.width):search<false>(a,r,1e20f);
    if(h.id<0)col=sky(r.d)*wt;
    else{
     Mat mat=a.mat[h.id];n=vv(mat.normal);bool flip=n.dot(r.d)>0;if(flip)n=n*(-1.f);
     key+=0xc2b2ae35u;col=lit(s,a,m,g,f,mat,n,r.o+r.d*h.t+n*.001f,l,key,wt,flip);
     if(mat.col.w>0&&s.max_depth>2)col=col+remainingBounces(s,a,m,g,f,r,h,wt,key);
    }
   }
  }
 }
 for(int i=16;i;i/=2){col.x+=__shfl_down_sync(~0u,col.x,i);col.y+=__shfl_down_sync(~0u,col.y,i);col.z+=__shfl_down_sync(~0u,col.z,i);}
 __shared__ float3 v[4];if(threadIdx.x%32==0)v[threadIdx.x/32]=make_float3(col.x,col.y,col.z);
 __syncthreads();
 if(!lane&&pi<np){float3 b=v[threadIdx.x/32+1];col=(col+Vec(b.x,b.y,b.z))*(1.f/s.spp);
  if(phase==2)col=col+Vec(out+3*px);out[3*px]=col.x;out[3*px+1]=col.y;out[3*px+2]=col.z;}
}
static void renderWave(Scene s,Acc a,ViewMaps vm,Shafts g,Mirrors ref,float* out){
 int n=s.width*s.height;cudaMemset(pixelCounts,0,12);
 splitPixels<<<(n+127)/128,128>>>(s,a,vm.cam,pixelList,pixelCounts);
 int h[3];cudaMemcpy(h,pixelCounts,12,cudaMemcpyDeviceToHost);
 cudaStreamWaitEvent(0,maskDone,0);
 for(int kind=0;kind<3;kind++)for(int p=0;p<h[kind];p+=STREAM){
  int np=std::min(STREAM,h[kind]-p),blocks=(np+1)/2;const int* list=pixelList+kind*n+p;
  if(kind==0)wave<0><<<blocks,128>>>(s,a,vm,g,filter,ref,list,pathState,out,np);
  if(kind==2)wave<3><<<blocks,128>>>(s,a,vm,g,filter,ref,list,pathState,out,np);
  if(kind==1){wave<1><<<blocks,128>>>(s,a,vm,g,filter,ref,list,pathState,out,np);if(ref.rect)cudaStreamWaitEvent(0,mirrorDone,0);wave<2><<<blocks,128>>>(s,a,vm,g,filter,ref,list,pathState,out,np);}
 }
}
struct ExactQuery {
 Acc a;const Triangle* raw;const int* order;
 __device__ const Triangle& triangle(int i)const{return raw[i];}
 template<bool any> __device__ Hit<double> find(Ray<double> r,double limit){
  int st[72],sp=0,node=0,id=-1;
  DV iv(1./(r.d.x!=0?r.d.x:1e-100),1./(r.d.y!=0?r.d.y:1e-100),1./(r.d.z!=0?r.d.z:1e-100));
  while(true){
   Box b=a.box[node];DV l=(DV(b.lo.x,b.lo.y,b.lo.z)-r.o)*iv,h=(DV(b.hi.x,b.hi.y,b.hi.z)-r.o)*iv;
   if(fmax(.0002,fmax(fmin(l.x,h.x),fmax(fmin(l.y,h.y),fmin(l.z,h.z))))<=fmin(limit,fmin(fmax(l.x,h.x),fmin(fmax(l.y,h.y),fmax(l.z,h.z))))){
    if(node<a.leaves-1){int2 ch=a.child[node];st[sp++]=ch.y;node=ch.x;continue;}
    int k=(node-a.leaves+1)*G;for(int j=k;j<min(k+G,a.n);j++){
     int tri=order[j];double t;if(intersect(raw[tri],r,limit,t)){id=tri;limit=t;if(any)return {t,id};}
    }
   }
   if(!sp)break;node=st[--sp];
  }return {limit,id};
 }
 __device__ Hit<double> closest(Ray<double> r,double l){return find<false>(r,l);}
 __device__ bool blocked(Ray<double> r,double l){return find<true>(r,l).id>=0;}
};
__global__ void exactTrace(Scene s,ExactQuery q,float4* tmp,int off,int count){
 int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=count)return;
 DV v=radiance<double>(s,(i+off)/s.spp,(i+off)%s.spp,q);
 tmp[i]=make_float4(float(v.x),float(v.y),float(v.z),0);
}
constexpr int chunk=524288;
void init(int mt,int mp,int ms){
 cudaStreamCreateWithFlags(&maskStream,cudaStreamNonBlocking);cudaStreamCreateWithFlags(&mirrorStream,cudaStreamNonBlocking);
 cudaEventCreateWithFlags(&maskDone,cudaEventDisableTiming);cudaEventCreateWithFlags(&mirrorDone,cudaEventDisableTiming);
 shaftMax=std::min(16*1024*1024,std::max(65536,mt*90));
 shaftStorage.cap=std::min(64*1024*1024,mt*140+100000);
 alloc(shaftStorage.count,shaftMax);alloc(shaftStorage.offset,shaftMax);alloc(shaftStorage.ids,shaftStorage.cap);
 cub::DeviceScan::ExclusiveSum(nullptr,shaftBytes,shaftStorage.count,shaftStorage.offset,shaftMax);cudaMalloc(&shaftScan,shaftBytes);
 filter.cap=std::min(1800000,mt*7+32000);
 alloc(filter.tab,(size_t)filter.cap*FBITS);alloc(filter.size,1);alloc(filter.groups,filter.cap);alloc(filter.headers,shaftMax);
 alloc(clusters,mt);alloc(clusterCount,1);mirrorStorage.cap=std::min(160000,mp/32+8000);alloc(mirrorStorage.rect,mt);alloc(mirrorStorage.num,1);alloc(mirrorStorage.jobs,mirrorStorage.cap);alloc(mirrorStorage.pixels,(size_t)mirrorStorage.cap*MTILE*MTILE);
 alloc(pixelCounts,3);alloc(pixelList,3*mp);alloc(pathState,(size_t)std::min(STREAM,mp)*(ms>32?64:1));
 int cap=(mp+TILE-1)/TILE+2;
 maps.light.w=maps.light.h=mp>=262144?3072:1024;
 int lightCap=maps.light.w*maps.light.h;
 maps.cam.cap=cap*3+mt*16+1000;alloc(maps.cam.z,cap);alloc(maps.cam.count,cap);alloc(maps.cam.offset,cap);alloc(maps.cam.ids,maps.cam.cap);
 maps.light.cap=lightCap+mt*48;alloc(maps.light.z,lightCap);alloc(maps.light.count,lightCap);alloc(maps.light.offset,lightCap);alloc(maps.light.ids,maps.light.cap);
 cub::DeviceScan::ExclusiveSum(nullptr,atlasBytes,maps.light.count,maps.light.offset,std::max(lightCap,cap));
 cudaMalloc(&atlasBuf,atlasBytes);
 alloc(workEstimate,1);alloc(projected,mt);alloc(largeIds,mt);alloc(numLarge,1);
 int L=(mt+G-1)/G;
 alloc(raw,mt);alloc(keys,mt);alloc(sorted,mt);alloc(order,mt);alloc(ids,mt);
 alloc(acc.box,2*L);alloc(acc.child,L);alloc(parent,2*L);alloc(ready,L);
 alloc(acc.tri,mt);alloc(acc.mat,mt);alloc(tmp,std::min((long long)mp*ms,(long long)chunk));
 cub::DeviceRadixSort::SortPairs(nullptr,scratchBytes,keys,sorted,order,ids,mt,0,30);
 cudaMalloc(&scratch,scratchBytes);
}
void render(const Scene& scene,float* out){
 Scene s=scene;s.ao_radius=fminf(s.ao_radius,128.f);int n=s.triangle_count;acc.leaves=(n+G-1)/G;acc.n=n;
 cudaMemcpy(raw,s.triangles,n*sizeof(Triangle),cudaMemcpyHostToDevice);s.triangles=nullptr;
 // World coordinates are bounded by the scene format.
 morton<<<(n+127)/128,128>>>(raw,n,keys,order,Vec(-32,-32,-32),Vec(16,16,16));
 cub::DeviceRadixSort::SortPairs(scratch,scratchBytes,keys,sorted,order,ids,n,0,30);
 int blocks=(acc.leaves+127)/128;
 links<<<blocks,128>>>(acc,sorted,parent);
 pack<<<blocks,128>>>(acc,raw,ids);
 cudaMemset(ready,0,acc.leaves*sizeof(int));
 bounds<<<blocks,128>>>(acc,parent,ready);
 // For small ray workloads the double-precision query avoids building directional tables.
 long long rays=(long long)s.width*s.height*s.spp;
 if((n<=32&&rays<=8000000)||rays*(1+s.ao)*s.max_depth<=40000000){
  int pix=s.width*s.height,batch=std::max(1,65536/s.spp/(1+s.ao/8));
  for(int p=0;p<pix;p+=batch){int np=std::min(batch,pix-p),cnt=np*s.spp;
   exactTrace<<<(cnt+127)/128,128>>>(s,{acc,raw,ids},tmp,p*s.spp,cnt);
   sum<<<(np+127)/128,128>>>(s,tmp,out,p,np);
  }return;
 }
 ViewMaps vm{};if(n>8&&s.width*s.height*s.spp>65536)vm=setupMaps(s,acc);
 Shafts g{};if(vm.light.w&&s.ao){g=makeShafts(acc,s.ao_radius);if(g.ih)buildSFilter(acc,g);}
 Mirrors ref{};if(vm.cam.w&&s.max_depth>1)ref=buildMirrors(s,acc,vm.cam);
 if(s.spp>32&&s.spp<=64&&s.ao==1&&vm.cam.w&&g.ih){renderWave(s,acc,vm,g,ref,out);return;}
 if(ref.rect)cudaStreamWaitEvent(0,mirrorDone,0);if(g.ih)cudaStreamWaitEvent(0,maskDone,0);
 int pix=s.width*s.height,batch=std::max(1,chunk/s.spp/(1+s.ao/4));
 for(int p=0;p<pix;p+=batch){
  int np=std::min(batch,pix-p),cnt=np*s.spp;
  if(s.spp>32&&s.spp<=64){
   if(s.ao==1)fused<64,1><<<(np+1)/2,128>>>(s,acc,vm,g,filter,ref,out,p,p+np);
   else fused<64,-1><<<(np+1)/2,128>>>(s,acc,vm,g,filter,ref,out,p,p+np);continue;
  }
  trace<<<(cnt+127)/128,128>>>(s,acc,vm,g,filter,ref,tmp,p*s.spp,cnt);
  sum<<<(np+127)/128,128>>>(s,tmp,out,p,np);
 }
}

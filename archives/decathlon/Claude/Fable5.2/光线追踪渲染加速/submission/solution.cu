// GPU ray tracer.
//  * CPU: parallel binned-SAH BVH2 (child boxes stored in the parent node).
//  * GPU: one thread per sample (a warp = samples of one pixel, so rays stay coherent), state-machine
//    megakernel, in-block reduction of the samples of each pixel.
//  * Camera rays and shadow rays are families of rays with a common projection (perspective from the
//    eye / orthographic along the light). For those a multi-level 2D grid of triangle lists is built
//    on the GPU and the ray tests the triangles of its cells with the same triangle test as the tree;
//    when a cell chain is too crowded the ray falls back to the tree.
//  * The grids need no tree, so they and the camera-ray pass run on the GPU while the CPU builds the tree.
#include "rt.h"
#include <cuda_runtime.h>
#include <immintrin.h>
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <cmath>
#include <vector>
#include <thread>
#include <atomic>
#include <algorithm>

#define BINS 16
#ifndef LEAFMAX
#define LEAFMAX 8
#endif
#ifndef CTV
#define CTV 2.0f
#endif
#define NODE_CHUNK 32
#define BOX_PAD 2e-5f
#ifndef GRID_MAXCAND
#define GRID_MAXCAND 256
#endif
#ifndef LGRID_MAXCAND
#define LGRID_MAXCAND 160
#endif
#ifndef LGRID_RES
#define LGRID_RES 2048
#endif
#ifndef GRID_MIN_SAMPLES
#define GRID_MIN_SAMPLES 4000000LL
#endif
#ifndef REC_MAX_BYTES
#define REC_MAX_BYTES 1600000000ULL
#endif
#ifndef MINBLK
#define MINBLK 6
#endif
#ifndef FLAT
#define FLAT 0
#endif
#ifndef KSTEP
#define KSTEP 6
#endif
#define GL 12            // max grid levels (dimension <= 2048, <= 8 cells at the top level -> 9 levels)

static void ck(cudaError_t e){if(e!=cudaSuccess){fprintf(stderr,"solution: %s\n",cudaGetErrorString(e));exit(2);}}

// ----------------------------------------------------------------------------- device side
struct Params {
    int width, height, spp, ao, max_depth, k, root, npix;
    unsigned seed;
    float ao_radius;
    float eye[3], u[3], v[3], w[3], l[3];
    int grid, rec, NL, gbase[GL], glw[GL];            // screen grid (camera rays)
    int lgrid, LNL, LW, LH, lbase[GL], llw[GL];       // light grid (shadow rays)
    float la[3], lb[3], lorg[3];
};
struct GridRef { const int* off; const int* end; const int* ent; };
struct Rec { float t; int id; };                      // camera-ray result: id>=0 hit, -1 miss, -2 not resolved

__device__ __forceinline__ uint32_t mixh(uint32_t x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;return x^(x>>16);}
__device__ __forceinline__ float smp(uint32_t x){return float(mixh(x)>>8)*(1.0f/16777216.0f);}

// ---------------------------------------------------------------- multi-level 2D triangle grid
// Level L has cells of 2^L base cells; a triangle is stored at the finest level where its bounding box
// spans <= 8 cells per axis, in the cells its projection may touch (conservative edge tests).
struct GridParams {
    int W,H,NL,ortho;
    int base[GL],lw[GL];
    float ra[3],rb[3],rc[3],eye[3];
    float cnear,bm,em;
};
__global__ void grid_insert(GridParams g,const float4* __restrict__ tris,int ntris,int* __restrict__ gcnt,int* __restrict__ gent,int mode){
    const int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=ntris)return;
    const float4 A=tris[3*i],E1=tris[3*i+1],E2=tris[3*i+2];
    float X[3][3];
    X[0][0]=A.x-g.eye[0];X[0][1]=A.y-g.eye[1];X[0][2]=A.z-g.eye[2];
    X[1][0]=X[0][0]+E1.x;X[1][1]=X[0][1]+E1.y;X[1][2]=X[0][2]+E1.z;
    X[2][0]=X[0][0]+E2.x;X[2][1]=X[0][1]+E2.y;X[2][2]=X[0][2]+E2.z;
    float qa[3],qb[3],qc[3];
    for(int k=0;k<3;k++){
        qa[k]=g.ra[0]*X[k][0]+g.ra[1]*X[k][1]+g.ra[2]*X[k][2];
        qb[k]=g.rb[0]*X[k][0]+g.rb[1]*X[k][1]+g.rb[2]*X[k][2];
        qc[k]=g.rc[0]*X[k][0]+g.rc[1]*X[k][1]+g.rc[2]*X[k][2];
    }
    const float fW=float(g.W),fH=float(g.H);
    int nbehind=0;
    float px[3]={0,0,0},py[3]={0,0,0},hn[3][3],hm[3]={0,0,0};
    if(g.ortho){
        for(int k=0;k<3;k++){px[k]=qa[k];py[k]=qb[k];}
    }else{
        nbehind=(qc[0]<g.cnear?1:0)+(qc[1]<g.cnear?1:0)+(qc[2]<g.cnear?1:0);
        if(nbehind==3)return;
        if(nbehind==0)for(int k=0;k<3;k++){px[k]=(qa[k]/qc[k]+1.0f)*0.5f*fW;py[k]=(1.0f-qb[k]/qc[k])*0.5f*fH;}
    }
    int ix0=0,ix1=g.W-1,iy0=0,iy1=g.H-1;
    bool cull=true;float sgn=1.0f;
    if(nbehind==0){
        float x0=fminf(px[0],fminf(px[1],px[2])),x1=fmaxf(px[0],fmaxf(px[1],px[2]));
        float y0=fminf(py[0],fminf(py[1],py[2])),y1=fmaxf(py[0],fmaxf(py[1],py[2]));
        x0-=g.bm+1e-4f*fabsf(x0);x1+=g.bm+1e-4f*fabsf(x1);
        y0-=g.bm+1e-4f*fabsf(y0);y1+=g.bm+1e-4f*fabsf(y1);
        if(!(x1>=0.0f&&x0<=fW&&y1>=0.0f&&y0<=fH))return;
        ix0=min(int(fmaxf(x0,0.0f)),g.W-1);ix1=int(fminf(x1,fW-1.0f));
        iy0=min(int(fmaxf(y0,0.0f)),g.H-1);iy1=int(fminf(y1,fH-1.0f));
        const float big=fmaxf(fmaxf(fabsf(px[0]),fabsf(px[1])),fmaxf(fmaxf(fabsf(px[2]),fabsf(py[0])),fmaxf(fabsf(py[1]),fabsf(py[2]))));
        const float ar=(px[2]-px[0])*(py[1]-py[0])-(py[2]-py[0])*(px[1]-px[0]);
        const float sc=(fabsf(px[1]-px[0])+fabsf(py[1]-py[0]))*(fabsf(px[2]-px[0])+fabsf(py[2]-py[0]));
        if(!(big<1e6f)||!(fabsf(ar)>1e-4f*sc+1e-20f))cull=false;
        sgn=ar>0.0f?1.0f:-1.0f;
    }else{
        // triangle crosses the eye plane: whole screen, homogeneous edge functions through the eye
        for(int e=0;e<3;e++){
            const int j=(e+1)%3,k=(e+2)%3;
            hn[e][0]=qb[j]*qc[k]-qc[j]*qb[k];
            hn[e][1]=qc[j]*qa[k]-qa[j]*qc[k];
            hn[e][2]=qa[j]*qb[k]-qb[j]*qa[k];
            const float lj=sqrtf(qa[j]*qa[j]+qb[j]*qb[j]+qc[j]*qc[j]),lk=sqrtf(qa[k]*qa[k]+qb[k]*qb[k]+qc[k]*qc[k]);
            hm[e]=1e-5f*lj*lk;
        }
        const float det=hn[0][0]*qa[0]+hn[0][1]*qb[0]+hn[0][2]*qc[0];
        const float l0=sqrtf(qa[0]*qa[0]+qb[0]*qb[0]+qc[0]*qc[0]);
        if(!(fabsf(det)>10.0f*hm[0]*l0))cull=false;
        sgn=det>0.0f?1.0f:-1.0f;
    }
    int L=0;
    while(((ix1>>L)-(ix0>>L))>7||((iy1>>L)-(iy0>>L))>7)L++;
    for(int cy=iy0>>L;cy<=(iy1>>L);cy++)for(int cx=ix0>>L;cx<=(ix1>>L);cx++){
        if(cull){
            const float X0=float(cx<<L),X1=float((cx+1)<<L),Y0=float(cy<<L),Y1=float((cy+1)<<L);
            bool outside=false;
            if(nbehind==0){
                for(int e=0;e<3;e++){
                    const int j=e,k=(e+1)%3;
                    const float dxe=px[k]-px[j],dye=py[k]-py[j];
                    const float xs=(sgn*dye>0.0f)?X1:X0,ys=(sgn*dxe<0.0f)?Y1:Y0;
                    const float tx=xs-px[j],ty=ys-py[j];
                    const float val=sgn*(tx*dye-ty*dxe);
                    const float m=g.em*(fabsf(dxe)+fabsf(dye))+1e-5f*(fabsf(tx*dye)+fabsf(ty*dxe));
                    if(val<-m)outside=true;
                }
            }else{
                const float xa=X0*2.0f/fW-1.0f,xb=X1*2.0f/fW-1.0f,ya=1.0f-Y1*2.0f/fH,yb=1.0f-Y0*2.0f/fH;
                for(int e=0;e<3;e++){
                    const float nx=sgn*hn[e][0],ny=sgn*hn[e][1],nz=sgn*hn[e][2];
                    const float xs=nx>0.0f?xb:xa,ys=ny>0.0f?yb:ya;
                    const float val=nx*xs+ny*ys+nz;
                    const float m=1e-4f*(fabsf(nx*xs)+fabsf(ny*ys)+fabsf(nz))+hm[e]*(fabsf(xs)+fabsf(ys)+1.0f)
                                  +g.em*(fabsf(nx)*2.0f/fW+fabsf(ny)*2.0f/fH);
                    if(val<-m)outside=true;
                }
            }
            if(outside)continue;
        }
        const int cell=g.base[L]+cy*g.lw[L]+cx;
        if(mode==0)atomicAdd(&gcnt[cell],1);
        else{const int slot=atomicAdd(&gcnt[cell],1);gent[slot]=i;}
    }
}
__global__ void grid_offsets(int ncells,int* __restrict__ gcnt,int* __restrict__ goff,int* __restrict__ total){
    const int i=blockIdx.x*blockDim.x+threadIdx.x;if(i>=ncells)return;
    const int c=gcnt[i];int st=0;
    if(c>0)st=atomicAdd(total,c);
    goff[i]=st;gcnt[i]=st;
}

// ---------------------------------------------------------------- ray macros
#define SL(n,i,oi) ((n)*(i)-(oi))
#define RAYINIT \
    idx=1.0f/(fabsf(dx)>1e-20f?dx:copysignf(1e-20f,dx)); \
    idy=1.0f/(fabsf(dy)>1e-20f?dy:copysignf(1e-20f,dy)); \
    idz=1.0f/(fabsf(dz)>1e-20f?dz:copysignf(1e-20f,dz)); \
    oix=ox*idx;oiy=oy*idy;oiz=oz*idz; \
    tbest=tmax;hit=-1;sp=0;stack[sp++]=-1;cur=P.root;any=phase!=0;
#define NODESTEP { \
    const float4 n0=nodes[4*cur],n1=nodes[4*cur+1],n2=nodes[4*cur+2],n3=nodes[4*cur+3]; \
    float a0=SL(n0.x,idx,oix),b0=SL(n0.y,idx,oix); \
    float a1=SL(n0.z,idy,oiy),b1=SL(n0.w,idy,oiy); \
    float a2=SL(n2.x,idz,oiz),b2=SL(n2.y,idz,oiz); \
    float t0n=fmaxf(fmaxf(fminf(a0,b0),fminf(a1,b1)),fmaxf(fminf(a2,b2),0.0f)); \
    float t0f=fminf(fminf(fmaxf(a0,b0),fmaxf(a1,b1)),fminf(fmaxf(a2,b2),tbest)); \
    float c0=SL(n1.x,idx,oix),d0=SL(n1.y,idx,oix); \
    float c1=SL(n1.z,idy,oiy),d1=SL(n1.w,idy,oiy); \
    float c2=SL(n2.z,idz,oiz),d2=SL(n2.w,idz,oiz); \
    float t1n=fmaxf(fmaxf(fminf(c0,d0),fminf(c1,d1)),fmaxf(fminf(c2,d2),0.0f)); \
    float t1f=fminf(fminf(fmaxf(c0,d0),fmaxf(c1,d1)),fminf(fmaxf(c2,d2),tbest)); \
    const bool h0=t0n<=t0f*1.0000005f,h1=t1n<=t1f*1.0000005f; \
    int ci0=__float_as_int(n3.x),ci1=__float_as_int(n3.y); \
    if(h0&&h1){ \
        if(t1n<t0n){int t=ci0;ci0=ci1;ci1=t;} \
        stack[sp++]=ci1;cur=ci0; \
    }else if(h0)cur=ci0; \
    else if(h1)cur=ci1; \
    else cur=stack[--sp]; }
// Moller-Trumbore exactly as in render_math.cuh (float); leaves `dd` = distance or `continue`s on a miss.
#define MT_PREP(arr,i) \
        const float4 A=arr[3*(i)],E1=arr[3*(i)+1],E2=arr[3*(i)+2]; \
        float pvx=dy*E2.z-dz*E2.y,pvy=dz*E2.x-dx*E2.z,pvz=dx*E2.y-dy*E2.x; \
        float det=E1.x*pvx+E1.y*pvy+E1.z*pvz; \
        if(fabsf(det)<1e-10f)continue; \
        float inv=1.0f/det; \
        float sx=ox-A.x,sy=oy-A.y,sz=oz-A.z; \
        float uu=(sx*pvx+sy*pvy+sz*pvz)*inv; \
        if(uu<0.0f||uu>1.0f)continue; \
        float qx=sy*E1.z-sz*E1.y,qy=sz*E1.x-sx*E1.z,qz=sx*E1.y-sy*E1.x; \
        float vv=(dx*qx+dy*qy+dz*qz)*inv; \
        if(vv<0.0f||uu+vv>1.0f)continue; \
        float dd=(E2.x*qx+E2.y*qy+E2.z*qz)*inv;
// leaf triangles are stored in tree order (trisB) and carry the original triangle index in A.w
#define LEAFSTEP { \
    const int v=~cur;int i=v&0xFFFFFF;const int e=i+(v>>24); \
    for(;i<e;i++){ \
        MT_PREP(trisB,i) \
        if(dd<=0.0002f||dd>=tbest)continue; \
        tbest=dd;hit=__float_as_int(A.w); \
        if(any)break; \
    } }
#define CAM_RAY \
    const uint32_t base=P.seed+uint32_t(pixel)*0x9e3779b9u+uint32_t(sid)*0x85ebca6bu; \
    float ox=P.eye[0],oy=P.eye[1],oz=P.eye[2]; \
    float dx,dy,dz; \
    { \
        float fx=(float(pixel%P.width)+smp(base))/float(P.width)*2.0f-1.0f; \
        float fy=1.0f-(float(pixel/P.width)+smp(base^0xa511e9b3u))/float(P.height)*2.0f; \
        dx=P.w[0]+P.u[0]*fx+P.v[0]*fy;dy=P.w[1]+P.u[1]*fx+P.v[1]*fy;dz=P.w[2]+P.u[2]*fx+P.v[2]*fy; \
        float inv=1.0f/sqrtf(dx*dx+dy*dy+dz*dz);dx*=inv;dy*=inv;dz*=inv; \
    }
// camera ray: closest hit among the triangles of the pixel's screen-grid cells (ties -> smaller index)
#define SGRID_QUERY(resolved,gt,gh) { \
    const int cx=pixel%P.width,cy=pixel/P.width; \
    int ncand=0; \
    for(int L=0;L<P.NL;L++){const int cell=P.gbase[L]+(cy>>L)*P.glw[L]+(cx>>L);ncand+=sg.end[cell]-sg.off[cell];} \
    if(ncand<=GRID_MAXCAND){ \
        for(int L=0;L<P.NL;L++){ \
            const int cell=P.gbase[L]+(cy>>L)*P.glw[L]+(cx>>L); \
            int j=sg.off[cell];const int je=sg.end[cell]; \
            for(;j<je;j++){ \
                const int ti=sg.ent[j]; \
                MT_PREP(trisO,ti) \
                if(dd<=0.0002f||dd>gt||(dd==gt&&ti>gh))continue; \
                gt=dd;gh=ti; \
            } \
        } \
        resolved=true; \
    } }

// camera-ray pass (needs only the screen grid): one record per sample
__global__ void __launch_bounds__(256) primary_kernel(Params P,const float4* __restrict__ trisO,GridRef sg,Rec* __restrict__ rec,int blockOffset)
{
    const int tid=threadIdx.x;
    const int blk=blockOffset+blockIdx.x;
    const int lp=tid/P.spp;
    const int sid=tid-lp*P.spp;
    const int pixel=blk*P.k+lp;
    if(pixel>=P.npix)return;
    CAM_RAY
    bool resolved=false;float gt=1e20f;int gh=-1;
    SGRID_QUERY(resolved,gt,gh)
    Rec r;r.t=gt;r.id=resolved?gh:-2;
    rec[size_t(pixel)*size_t(P.spp)+size_t(sid)]=r;
}

__global__ void __launch_bounds__(256,MINBLK) trace_kernel(Params P,const float4* __restrict__ nodes,const float4* __restrict__ trisB,
                                     const float4* __restrict__ trisO,const float4* __restrict__ mats,float* __restrict__ out,int blockOffset,
                                     GridRef sg,GridRef lg,const Rec* __restrict__ rec)
{
    __shared__ float acc[3*256];
    const int tid=threadIdx.x;
    const int blk=blockOffset+blockIdx.x;
    const int lp=tid/P.spp;
    const int sid=tid-lp*P.spp;
    const int pixel=blk*P.k+lp;
    float R=0.0f,G=0.0f,B=0.0f;
    if(pixel<P.npix){
        CAM_RAY
        const float lx=P.l[0],ly=P.l[1],lz=P.l[2];
        float through=1.0f,tmax=1e20f;
        int depth=0,phase=0,open=0,a=0;
        float px=0,py=0,pz=0,nx=0,ny=0,nz=0,rx=0,ry=0,rz=0,cr=0,cg=0,cb=0,mirror=0,cosine=0,visible=0;
        float txx=0,txy=0,txz=0,tyx=0,tyy=0,tyz=0;
        int stack[64];
        float idx=0,idy=0,idz=0,oix=0,oiy=0,oiz=0,tbest=0;int hit=-1,sp=0,cur=-1;bool any=false;
        bool gridDone=false;float gt=1e20f;int gh=-1;
        if(P.rec){
            const Rec r=rec[size_t(pixel)*size_t(P.spp)+size_t(sid)];
            if(r.id>=-1){gridDone=true;gt=r.t;gh=r.id;}
        }else if(P.grid){
            SGRID_QUERY(gridDone,gt,gh)
        }
#if FLAT
        bool fresh=true;
#endif
        for(;;){
#if FLAT
          if(fresh){
            fresh=false;
#endif
            RAYINIT
            if(gridDone){gridDone=false;tbest=gt;hit=gh;cur=-1;}
            else if(phase==1&&P.lgrid){
                // shadow ray: any hit among the triangles of its light-grid cells
                const float qx0=ox-P.lorg[0],qy0=oy-P.lorg[1],qz0=oz-P.lorg[2];
                const int cx=min(max(int(floorf(P.la[0]*qx0+P.la[1]*qy0+P.la[2]*qz0)),0),P.LW-1);
                const int cy=min(max(int(floorf(P.lb[0]*qx0+P.lb[1]*qy0+P.lb[2]*qz0)),0),P.LH-1);
                int ncand=0;
                for(int L=0;L<P.LNL;L++){const int cell=P.lbase[L]+(cy>>L)*P.llw[L]+(cx>>L);ncand+=lg.end[cell]-lg.off[cell];}
                if(ncand<=LGRID_MAXCAND){
                    for(int L=0;L<P.LNL&&hit<0;L++){
                        const int cell=P.lbase[L]+(cy>>L)*P.llw[L]+(cx>>L);
                        int j=lg.off[cell];const int je=lg.end[cell];
                        for(;j<je;j++){
                            const int ti=lg.ent[j];
                            MT_PREP(trisO,ti)
                            if(dd<=0.0002f||dd>=tbest)continue;
                            hit=ti;break;
                        }
                    }
                    cur=-1;
                }
            }
#if FLAT
          }
            for(int it=0;it<KSTEP&&cur>=0;it++)NODESTEP
            if(cur<-1){
                LEAFSTEP
                cur=(any&&hit>=0)?-1:stack[--sp];
            }
            if(cur!=-1)continue;
            fresh=true;
#else
            for(;;){
                while(cur>=0)NODESTEP
                if(cur==-1)break;
                LEAFSTEP
                if(any&&hit>=0)break;
                cur=stack[--sp];
            }
#endif
            // ---------------- shading state machine
            bool shade=true;
            if(phase==0){
                if(hit<0){
                    float aa=0.5f*(dy+1.0f);
                    R+=through*(0.95f*(1.0f-aa)+0.40f*aa);
                    G+=through*(0.93f*(1.0f-aa)+0.55f*aa);
                    B+=through*(0.95f*(1.0f-aa)+0.85f*aa);
                    break;
                }
                const float4 E1=trisO[3*hit+1],E2=trisO[3*hit+2],M=mats[hit];
                nx=E1.y*E2.z-E1.z*E2.y;ny=E1.z*E2.x-E1.x*E2.z;nz=E1.x*E2.y-E1.y*E2.x;
                {float inv=1.0f/sqrtf(nx*nx+ny*ny+nz*nz);nx*=inv;ny*=inv;nz*=inv;}
                float nd=nx*dx+ny*dy+nz*dz;
                if(nd>0.0f){nx=-nx;ny=-ny;nz=-nz;nd=nx*dx+ny*dy+nz*dz;}
                px=ox+dx*tbest+nx*0.001f;py=oy+dy*tbest+ny*0.001f;pz=oz+dz*tbest+nz*0.001f;
                cr=M.x;cg=M.y;cb=M.z;mirror=M.w;
                cosine=nx*lx+ny*ly+nz*lz;if(cosine<0.0f)cosine=0.0f;
                {
                    float k2=2.0f*nd;
                    rx=dx-nx*k2;ry=dy-ny*k2;rz=dz-nz*k2;
                    float inv=1.0f/sqrtf(rx*rx+ry*ry+rz*rz);rx*=inv;ry*=inv;rz*=inv;
                }
                visible=0.0f;open=0;a=0;
                if(mirror==1.0f)shade=false;      // weight (1-mirror) is exactly 0: shadow/AO cannot contribute
                else{
                    if(P.ao>0){
                        // axis = |n.z|<.8 ? (0,0,1) : (0,1,0); tx = axis x n (unit); ty = n x tx
                        if(fabsf(nz)<0.8f){txx=-ny;txy=nx;txz=0.0f;}
                        else{txx=nz;txy=0.0f;txz=-nx;}
                        float inv=1.0f/sqrtf(txx*txx+txy*txy+txz*txz);txx*=inv;txy*=inv;txz*=inv;
                        tyx=ny*txz-nz*txy;tyy=nz*txx-nx*txz;tyz=nx*txy-ny*txx;
                    }
                    if(cosine>0.0f){phase=1;ox=px;oy=py;oz=pz;dx=lx;dy=ly;dz=lz;tmax=1e20f;continue;}
                }
            }else if(phase==1){visible=hit<0?1.0f:0.0f;}
            else{open+=(hit<0)?1:0;a++;}
            if(shade){
                if(a<P.ao){
                    uint32_t key=base+uint32_t(depth)*0xc2b2ae35u+uint32_t(a)*0x27d4eb2du;
                    float x=2.0f*smp(key^0x68bc21ebu)-1.0f,y=2.0f*smp(key^0x02e5be93u)-1.0f;
                    float z=0.25f+0.75f*smp(key^0x967a889bu);
                    float ex=txx*x+tyx*y+nx*z,ey=txy*x+tyy*y+ny*z,ez=txz*x+tyz*y+nz*z;
                    float inv=1.0f/sqrtf(ex*ex+ey*ey+ez*ez);
                    dx=ex*inv;dy=ey*inv;dz=ez*inv;ox=px;oy=py;oz=pz;tmax=P.ao_radius;phase=2;continue;
                }
                float ambient=P.ao?float(open)/float(P.ao):1.0f;
                float value=0.08f+0.20f*ambient+0.72f*cosine*visible;
                float wgt=value*(1.0f-mirror);
                R+=through*cr*wgt;G+=through*cg*wgt;B+=through*cb*wgt;
            }
            through*=mirror;
            if(mirror==0.0f)break;
            if(++depth>=P.max_depth)break;
            ox=px;oy=py;oz=pz;dx=rx;dy=ry;dz=rz;phase=0;tmax=1e20f;
        }
    }
    acc[tid]=R;acc[256+tid]=G;acc[512+tid]=B;
    __syncthreads();
    if(tid<P.k){
        const int pix=blk*P.k+tid;
        if(pix<P.npix){
            float sr=0.0f,sg2=0.0f,sb=0.0f;const int b=tid*P.spp;
            for(int j=0;j<P.spp;j++){sr+=acc[b+j];sg2+=acc[256+b+j];sb+=acc[512+b+j];}
            const float n=float(P.spp);
            out[3*size_t(pix)]=sr/n;out[3*size_t(pix)+1]=sg2/n;out[3*size_t(pix)+2]=sb/n;
        }
    }
}

// ----------------------------------------------------------------------------- host side
struct Prim { __m128 lo, hi; };            // lo.w = float(triangle id), hi.w = 0
struct Box { __m128 lo, hi, clo, chi; };
struct GridBuf { int *off=nullptr,*cnt=nullptr,*ent=nullptr,*total=nullptr; size_t capCells=0,capEnt=0; };

static Prim* g_prims=nullptr;
static int g_capTris=0,g_capNodes=0;
static float *h_nodes=nullptr,*h_trisB=nullptr,*h_trisO=nullptr,*h_mats=nullptr;
static float4 *d_nodes=nullptr,*d_trisB=nullptr,*d_trisO=nullptr,*d_mats=nullptr;
static GridBuf g_sg,g_lg;
static Rec* d_rec=nullptr;static size_t g_capRec=0;
static std::atomic<int> g_next;
static const Triangle* g_T=nullptr;
static int g_parThreshold=1<<30;

static void ensureCapacity(int n){
    if(n<=g_capTris)return;
    if(g_prims){_mm_free(g_prims);ck(cudaFreeHost(h_nodes));ck(cudaFreeHost(h_trisB));ck(cudaFreeHost(h_trisO));ck(cudaFreeHost(h_mats));
        ck(cudaFree(d_nodes));ck(cudaFree(d_trisB));ck(cudaFree(d_trisO));ck(cudaFree(d_mats));}
    g_capTris=n;g_capNodes=n+n/8+16384;
    g_prims=(Prim*)_mm_malloc(size_t(n)*sizeof(Prim),64);
    if(!g_prims){fprintf(stderr,"solution: out of memory\n");exit(2);}
    ck(cudaMallocHost(&h_nodes,size_t(g_capNodes)*64));
    ck(cudaMallocHost(&h_trisB,size_t(n)*48));
    ck(cudaMallocHost(&h_trisO,size_t(n)*48));
    ck(cudaMallocHost(&h_mats,size_t(n)*16));
    ck(cudaMalloc(&d_nodes,size_t(g_capNodes)*64));
    ck(cudaMalloc(&d_trisB,size_t(n)*48));
    ck(cudaMalloc(&d_trisO,size_t(n)*48));
    ck(cudaMalloc(&d_mats,size_t(n)*16));
    // touch host memory
    memset(h_nodes,0,size_t(g_capNodes)*64);memset(h_trisB,0,size_t(n)*48);memset(h_trisO,0,size_t(n)*48);memset(h_mats,0,size_t(n)*16);
    memset(g_prims,0,size_t(n)*sizeof(Prim));
}
static void ensureGrid(GridBuf& b,size_t cells,size_t ents){
    if(cells>b.capCells){
        if(b.off){ck(cudaFree(b.off));ck(cudaFree(b.cnt));}
        b.capCells=cells;
        ck(cudaMalloc(&b.off,cells*sizeof(int)));ck(cudaMalloc(&b.cnt,cells*sizeof(int)));
    }
    if(ents>b.capEnt){
        if(b.ent)ck(cudaFree(b.ent));
        b.capEnt=ents;ck(cudaMalloc(&b.ent,ents*sizeof(int)));
    }
    if(!b.total)ck(cudaMalloc(&b.total,sizeof(int)));
}
// level tables for a W x H grid; returns the number of cells
static size_t gridLevels(GridParams& g,int W,int H){
    g.W=W;g.H=H;
    int NL=1;while((((W-1)>>(NL-1))>7||((H-1)>>(NL-1))>7)&&NL<GL)NL++;
    g.NL=NL;size_t cells=0;
    for(int L=0;L<GL;L++){
        g.base[L]=int(cells);g.lw[L]=((W-1)>>L)+1;
        if(L<NL)cells+=size_t(g.lw[L])*(((H-1)>>L)+1);
    }
    return cells;
}
static void buildGrid(GridBuf& b,const GridParams& g,size_t cells,int N){
    ensureGrid(b,cells,64*size_t(N));
    ck(cudaMemsetAsync(b.cnt,0,cells*sizeof(int),0));
    ck(cudaMemsetAsync(b.total,0,sizeof(int),0));
    grid_insert<<<(N+255)/256,256>>>(g,d_trisO,N,b.cnt,b.ent,0);
    grid_offsets<<<int((cells+255)/256),256>>>(int(cells),b.cnt,b.off,b.total);
    grid_insert<<<(N+255)/256,256>>>(g,d_trisO,N,b.cnt,b.ent,1);
}

static inline __m128 cenOf(const Prim& p){return _mm_mul_ps(_mm_add_ps(p.lo,p.hi),_mm_set1_ps(0.5f));}
static inline float areaOf(__m128 lo,__m128 hi){float f[4];_mm_storeu_ps(f,_mm_sub_ps(hi,lo));return f[0]*f[1]+f[1]*f[2]+f[2]*f[0];}
static inline __m128 binScale(__m128 clo,__m128 chi){
    __m128 ext=_mm_sub_ps(chi,clo);
    __m128 m=_mm_cmpgt_ps(ext,_mm_set1_ps(1e-9f));
    return _mm_and_ps(m,_mm_mul_ps(_mm_div_ps(_mm_set1_ps(float(BINS)),ext),_mm_set1_ps(1.0f-1e-6f)));
}
static inline __m128i binIdx(const Prim& p,__m128 clo,__m128 scale){
    __m128i bi=_mm_cvttps_epi32(_mm_mul_ps(_mm_sub_ps(cenOf(p),clo),scale));
    return _mm_max_epi32(_mm_min_epi32(bi,_mm_set1_epi32(BINS-1)),_mm_setzero_si128());
}
static inline void emptyBox(Box& b){b.lo=b.clo=_mm_set1_ps(1e30f);b.hi=b.chi=_mm_set1_ps(-1e30f);}
static inline void growBox(Box& b,const Prim& q){
    b.lo=_mm_min_ps(b.lo,q.lo);b.hi=_mm_max_ps(b.hi,q.hi);__m128 c=cenOf(q);b.clo=_mm_min_ps(b.clo,c);b.chi=_mm_max_ps(b.chi,c);
}

struct Split { int axis, bin; float cost; };
static __declspec(noinline) Split findSplit(const Prim* P,int b,int e,__m128 clo,__m128 scale,int stride){
    __m128 blo[3][BINS],bhi[3][BINS];int cnt[3][BINS];
    const __m128 pinf=_mm_set1_ps(1e30f),ninf=_mm_set1_ps(-1e30f);
    for(int k=0;k<3;k++)for(int j=0;j<BINS;j++){blo[k][j]=pinf;bhi[k][j]=ninf;cnt[k][j]=0;}
    for(int i=b;i<e;i+=stride){
        const __m128 lo=P[i].lo,hi=P[i].hi;
        const __m128i bi=binIdx(P[i],clo,scale);
        const int b0=_mm_cvtsi128_si32(bi),b1=_mm_extract_epi32(bi,1),b2=_mm_extract_epi32(bi,2);
        blo[0][b0]=_mm_min_ps(blo[0][b0],lo);bhi[0][b0]=_mm_max_ps(bhi[0][b0],hi);cnt[0][b0]++;
        blo[1][b1]=_mm_min_ps(blo[1][b1],lo);bhi[1][b1]=_mm_max_ps(bhi[1][b1],hi);cnt[1][b1]++;
        blo[2][b2]=_mm_min_ps(blo[2][b2],lo);bhi[2][b2]=_mm_max_ps(bhi[2][b2],hi);cnt[2][b2]++;
    }
    Split s{-1,0,1e30f};
    for(int k=0;k<3;k++){
        float rarea[BINS];int rcnt[BINS];__m128 alo=pinf,ahi=ninf;int ac=0;
        for(int j=BINS-1;j>0;j--){ac+=cnt[k][j];alo=_mm_min_ps(alo,blo[k][j]);ahi=_mm_max_ps(ahi,bhi[k][j]);rcnt[j]=ac;rarea[j]=ac?areaOf(alo,ahi):0.0f;}
        alo=pinf;ahi=ninf;ac=0;
        for(int j=1;j<BINS;j++){ac+=cnt[k][j-1];alo=_mm_min_ps(alo,blo[k][j-1]);ahi=_mm_max_ps(ahi,bhi[k][j-1]);
            if(!ac||!rcnt[j])continue;float c=areaOf(alo,ahi)*float(ac)+rarea[j]*float(rcnt[j]);
            if(c<s.cost){s.cost=c;s.axis=k;s.bin=j;}}
    }
    return s;
}

struct Alloc { int cur=0,end=0; };
static inline int allocNode(Alloc& a){
    if(a.cur==a.end){a.cur=g_next.fetch_add(NODE_CHUNK);a.end=a.cur+NODE_CHUNK;
        if(a.end>g_capNodes){fprintf(stderr,"solution: node pool exhausted\n");exit(2);}}
    return a.cur++;
}
static inline void writeTri(float* o,const Triangle& t,int id){
    o[0]=t.v0[0];o[1]=t.v0[1];o[2]=t.v0[2];memcpy(o+3,&id,4);
    o[4]=t.v1[0]-t.v0[0];o[5]=t.v1[1]-t.v0[1];o[6]=t.v1[2]-t.v0[2];o[7]=0.0f;
    o[8]=t.v2[0]-t.v0[0];o[9]=t.v2[1]-t.v0[1];o[10]=t.v2[2]-t.v0[2];o[11]=0.0f;
}
static int makeLeaf(int b,int e){
    for(int i=b;i<e;i++){
        const int id=int(_mm_cvtss_f32(_mm_shuffle_ps(g_prims[i].lo,g_prims[i].lo,0xFF)));
        writeTri(h_trisB+12*size_t(i),g_T[id],id);
    }
    return ~(b|((e-b)<<24));
}
static int buildRec(int b,int e,const Box& bx,int depth,Alloc& al){
    Prim* P=g_prims;const int cnt=e-b;
    if(cnt<=1)return makeLeaf(b,e);
    const bool force=depth>=40;
    const __m128 scale=binScale(bx.clo,bx.chi);
    Split s{-1,0,1e30f};
    if(!force)s=findSplit(P,b,e,bx.clo,scale,std::max(1,cnt/4096));
    if(cnt<=LEAFMAX){
        float pa=areaOf(bx.lo,bx.hi);
        float splitCost=CTV+((pa>0.0f&&s.axis>=0)?s.cost/pa:1e30f);
        if(float(cnt)<=splitCost)return makeLeaf(b,e);
    }
    Box L,Rb;emptyBox(L);emptyBox(Rb);int mid=b;
    if(s.axis>=0){
        const int axis=s.axis,sb=s.bin;const __m128 clo=bx.clo;
        auto binof=[&](const Prim& q){alignas(16) int t[4];_mm_store_si128((__m128i*)t,binIdx(q,clo,scale));return t[axis];};
        int i=b,j=e-1;
        for(;;){
            while(i<=j&&binof(P[i])<sb){growBox(L,P[i]);i++;}
            while(i<=j&&binof(P[j])>=sb){growBox(Rb,P[j]);j--;}
            if(i>=j)break;
            Prim t=P[i];P[i]=P[j];P[j]=t;growBox(L,P[i]);growBox(Rb,P[j]);i++;j--;
        }
        mid=i;
    }
    if(mid<=b||mid>=e){
        if(cnt<=15)return makeLeaf(b,e);
        float ext[4];_mm_storeu_ps(ext,_mm_sub_ps(bx.chi,bx.clo));
        int axis=0;if(ext[1]>ext[axis])axis=1;if(ext[2]>ext[axis])axis=2;
        mid=(b+e)/2;
        std::nth_element(P+b,P+mid,P+e,[axis](const Prim& x,const Prim& y){
            return ((const float*)&x.lo)[axis]+((const float*)&x.hi)[axis]<((const float*)&y.lo)[axis]+((const float*)&y.hi)[axis];});
        emptyBox(L);emptyBox(Rb);
        for(int i=b;i<mid;i++)growBox(L,P[i]);
        for(int i=mid;i<e;i++)growBox(Rb,P[i]);
    }
    const int id=allocNode(al);
    int l,r;
    if(cnt>g_parThreshold){
        std::thread th([&]{Alloc a2;l=buildRec(b,mid,L,depth+1,a2);});
        r=buildRec(mid,e,Rb,depth+1,al);th.join();
    }else{l=buildRec(b,mid,L,depth+1,al);r=buildRec(mid,e,Rb,depth+1,al);}
    float ll[4],lh[4],rl[4],rh[4];
    const __m128 pad=_mm_set1_ps(BOX_PAD);
    _mm_storeu_ps(ll,_mm_sub_ps(L.lo,pad));_mm_storeu_ps(lh,_mm_add_ps(L.hi,pad));
    _mm_storeu_ps(rl,_mm_sub_ps(Rb.lo,pad));_mm_storeu_ps(rh,_mm_add_ps(Rb.hi,pad));
    float* n=h_nodes+16*size_t(id);
    n[0]=ll[0];n[1]=lh[0];n[2]=ll[1];n[3]=lh[1];
    n[4]=rl[0];n[5]=rh[0];n[6]=rl[1];n[7]=rh[1];
    n[8]=ll[2];n[9]=lh[2];n[10]=rl[2];n[11]=rh[2];
    memcpy(n+12,&l,4);memcpy(n+13,&r,4);n[14]=0.0f;n[15]=0.0f;
    return id;
}

void init(int mt,int mp,int ms){
    ensureCapacity(std::max(mt,1));
    ensureGrid(g_sg,2*size_t(std::max(mp,1))+16384,64*size_t(std::max(mt,1)));
    ensureGrid(g_lg,size_t(LGRID_RES)*LGRID_RES*3/2+16384,64*size_t(std::max(mt,1)));
    const unsigned long long samples=(unsigned long long)std::max(mp,1)*(unsigned long long)std::max(ms,1);
    if((long long)samples>=GRID_MIN_SAMPLES&&samples*sizeof(Rec)<=REC_MAX_BYTES){
        g_capRec=size_t(samples);ck(cudaMalloc(&d_rec,g_capRec*sizeof(Rec)));
    }
}

#ifdef DEVTIME
#include <chrono>
static double nowms(){return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count();}
#define TICK(name) {double t=nowms();fprintf(stderr,"[%s %.3f] ",name,t-g_t0);g_t0=t;}
static double g_t0;
#else
#define TICK(name)
#endif
void render(const Scene& s,float* out){
#ifdef DEVTIME
    g_t0=nowms();
#endif
    const int N=s.triangle_count;
    ensureCapacity(N);
    g_T=s.triangles;
    // primitive bounds + triangles in original order (v0, e1, e2) and materials
    Box root;emptyBox(root);
    {
        const Triangle* T=s.triangles;Prim* P=g_prims;float* ho=h_trisO;float* hm=h_mats;
        auto work=[T,P,ho,hm](int b,int e,Box* bx){
            Box r;emptyBox(r);
            for(int i=b;i<e;i++){
                const Triangle& t=T[i];
                __m128 a=_mm_setr_ps(t.v0[0],t.v0[1],t.v0[2],0.0f),bb=_mm_setr_ps(t.v1[0],t.v1[1],t.v1[2],0.0f),c=_mm_setr_ps(t.v2[0],t.v2[1],t.v2[2],0.0f);
                __m128 lo=_mm_min_ps(a,_mm_min_ps(bb,c)),hi=_mm_max_ps(a,_mm_max_ps(bb,c));
                lo=_mm_insert_ps(lo,_mm_set_ss(float(i)),0x30);
                P[i].lo=lo;P[i].hi=hi;growBox(r,P[i]);
                writeTri(ho+12*size_t(i),t,i);
                float* m=hm+4*size_t(i);m[0]=t.color[0];m[1]=t.color[1];m[2]=t.color[2];m[3]=t.mirror;
            }
            *bx=r;
        };
        const int nt=N>=32768?8:1;
        if(nt==1)work(0,N,&root);
        else{
            Box part[8];std::thread th[8];
            for(int k=1;k<nt;k++)th[k]=std::thread(work,int((long long)N*k/nt),int((long long)N*(k+1)/nt),&part[k]);
            work(0,N/nt,&part[0]);
            for(int k=1;k<nt;k++)th[k].join();
            for(int k=0;k<nt;k++){root.lo=_mm_min_ps(root.lo,part[k].lo);root.hi=_mm_max_ps(root.hi,part[k].hi);
                root.clo=_mm_min_ps(root.clo,part[k].clo);root.chi=_mm_max_ps(root.chi,part[k].chi);}
        }
    }
    TICK("prims")
    ck(cudaMemcpyAsync(d_trisO,h_trisO,size_t(N)*48,cudaMemcpyHostToDevice,0));
    ck(cudaMemcpyAsync(d_mats,h_mats,size_t(N)*16,cudaMemcpyHostToDevice,0));

    Params P;
    P.width=s.width;P.height=s.height;P.spp=s.spp;P.ao=s.ao;P.max_depth=s.max_depth;
    P.k=std::max(1,256/s.spp);P.root=-1;P.npix=s.width*s.height;P.seed=s.seed;P.ao_radius=s.ao_radius;
    for(int k=0;k<3;k++){P.eye[k]=s.eye[k];P.u[k]=s.u[k];P.v[k]=s.v[k];P.w[k]=s.w[k];}
    double ld[3];
    {
        float d=s.light[0]*s.light[0]+s.light[1]*s.light[1]+s.light[2]*s.light[2];
        float inv=1.0f/sqrtf(d);
        for(int k=0;k<3;k++){P.l[k]=s.light[k]*inv;ld[k]=double(P.l[k]);}
    }
    P.grid=0;P.rec=0;P.NL=1;P.lgrid=0;P.LNL=1;P.LW=1;P.LH=1;
    for(int k=0;k<GL;k++){P.gbase[k]=0;P.glw[k]=1;P.lbase[k]=0;P.llw[k]=1;}
    for(int k=0;k<3;k++){P.la[k]=0.0f;P.lb[k]=0.0f;P.lorg[k]=0.0f;}
    const long long samples=(long long)P.npix*s.spp;
    const bool bigJob=samples>=GRID_MIN_SAMPLES;
    const int bs=P.k*s.spp;
    const int nblocks=(P.npix+P.k-1)/P.k;
    GridRef sg{g_sg.off,g_sg.cnt,g_sg.ent},lg{g_lg.off,g_lg.cnt,g_lg.ent};
#ifndef NOGRID
    if(bigJob){
        // ---- screen grid: perspective projection through the eye
        GridParams g;memset(&g,0,sizeof(g));
        const size_t cells=gridLevels(g,s.width,s.height);
        const double u[3]={s.u[0],s.u[1],s.u[2]},v[3]={s.v[0],s.v[1],s.v[2]},w[3]={s.w[0],s.w[1],s.w[2]};
        const double vw[3]={v[1]*w[2]-v[2]*w[1],v[2]*w[0]-v[0]*w[2],v[0]*w[1]-v[1]*w[0]};
        const double wu[3]={w[1]*u[2]-w[2]*u[1],w[2]*u[0]-w[0]*u[2],w[0]*u[1]-w[1]*u[0]};
        const double uv[3]={u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]};
        const double det=u[0]*vw[0]+u[1]*vw[1]+u[2]*vw[2];
        const double lu=sqrt(u[0]*u[0]+u[1]*u[1]+u[2]*u[2]),lv=sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]),lw=sqrt(w[0]*w[0]+w[1]*w[1]+w[2]*w[2]);
        if(std::isfinite(det)&&lu*lv*lw>0.0&&fabs(det)>1e-6*lu*lv*lw){
            for(int k=0;k<3;k++){g.ra[k]=float(vw[k]/det);g.rb[k]=float(wu[k]/det);g.rc[k]=float(uv[k]/det);g.eye[k]=s.eye[k];}
            g.cnear=float(0.0001/(lu+lv+lw));g.ortho=0;g.bm=0.05f;g.em=0.1f;
            buildGrid(g_sg,g,cells,N);
            sg=GridRef{g_sg.off,g_sg.cnt,g_sg.ent};
            P.grid=1;P.NL=g.NL;for(int k=0;k<GL;k++){P.gbase[k]=g.base[k];P.glw[k]=g.lw[k];}
        }
    }
#endif
#ifndef NOLGRID
    if(bigJob){
        // ---- light grid: orthographic projection along the light direction
        double ea[3],eb[3];
        {
            const double ax[3]={fabs(ld[0])<0.6?1.0:0.0,fabs(ld[0])<0.6?0.0:1.0,0.0};
            ea[0]=ax[1]*ld[2]-ax[2]*ld[1];ea[1]=ax[2]*ld[0]-ax[0]*ld[2];ea[2]=ax[0]*ld[1]-ax[1]*ld[0];
            const double n=sqrt(ea[0]*ea[0]+ea[1]*ea[1]+ea[2]*ea[2]);
            for(int k=0;k<3;k++)ea[k]/=n;
            eb[0]=ld[1]*ea[2]-ld[2]*ea[1];eb[1]=ld[2]*ea[0]-ld[0]*ea[2];eb[2]=ld[0]*ea[1]-ld[1]*ea[0];
            const double m=sqrt(eb[0]*eb[0]+eb[1]*eb[1]+eb[2]*eb[2]);
            for(int k=0;k<3;k++)eb[k]/=m;
        }
        float blo[4],bhi[4];_mm_storeu_ps(blo,root.lo);_mm_storeu_ps(bhi,root.hi);
        double amin=1e300,amax=-1e300,bmin=1e300,bmax=-1e300;
        for(int c=0;c<8;c++){
            const double x=(c&1)?double(bhi[0])+0.01:double(blo[0])-0.01,y=(c&2)?double(bhi[1])+0.01:double(blo[1])-0.01,z=(c&4)?double(bhi[2])+0.01:double(blo[2])-0.01;
            const double pa=ea[0]*x+ea[1]*y+ea[2]*z,pb=eb[0]*x+eb[1]*y+eb[2]*z;
            amin=std::min(amin,pa);amax=std::max(amax,pa);bmin=std::min(bmin,pb);bmax=std::max(bmax,pb);
        }
        const double ext=std::max(amax-amin,bmax-bmin);
        if(std::isfinite(ext)&&ext>1e-6&&std::isfinite(ld[0]+ld[1]+ld[2])){
            const double cell=ext/double(LGRID_RES)*1.0001;
            const int LW=std::min(LGRID_RES,std::max(1,int(ceil((amax-amin)/cell))));
            const int LH=std::min(LGRID_RES,std::max(1,int(ceil((bmax-bmin)/cell))));
            GridParams g;memset(&g,0,sizeof(g));
            const size_t cells=gridLevels(g,LW,LH);
            for(int k=0;k<3;k++){
                g.ra[k]=float(ea[k]/cell);g.rb[k]=float(eb[k]/cell);g.rc[k]=0.0f;
                g.eye[k]=float(amin*ea[k]+bmin*eb[k]);
            }
            g.cnear=0.0f;g.ortho=1;g.bm=0.05f;g.em=0.1f;
            buildGrid(g_lg,g,cells,N);
            lg=GridRef{g_lg.off,g_lg.cnt,g_lg.ent};
            P.lgrid=1;P.LNL=g.NL;P.LW=LW;P.LH=LH;
            for(int k=0;k<GL;k++){P.lbase[k]=g.base[k];P.llw[k]=g.lw[k];}
            for(int k=0;k<3;k++){P.la[k]=g.ra[k];P.lb[k]=g.rb[k];P.lorg[k]=g.eye[k];}
        }
    }
#endif
#ifndef NOREC
    if(P.grid&&d_rec&&size_t(samples)<=g_capRec){
        // camera-ray pass on the GPU while the CPU builds the tree
        const int per=std::max(1,int(16000000LL/bs));
        for(int off=0;off<nblocks;off+=per){
            const int nb=std::min(per,nblocks-off);
            primary_kernel<<<nb,bs>>>(P,d_trisO,sg,d_rec,off);
        }
        P.rec=1;
    }
#endif
    cudaStreamQuery(0);     // flush queued work to the GPU now (WDDM batches submissions)
    TICK("early")
#ifdef DIAG_SYNC
    cudaDeviceSynchronize();TICK("passA")
#endif

    g_next=0;
    g_parThreshold=std::max(4096,N/24);
    Alloc al;
    const int rootRef=buildRec(0,N,root,0,al);
    TICK("build")
    const int nodeCount=std::min(g_next.load(),g_capNodes);
    if(nodeCount>0)ck(cudaMemcpyAsync(d_nodes,h_nodes,size_t(nodeCount)*64,cudaMemcpyHostToDevice,0));
    ck(cudaMemcpyAsync(d_trisB,h_trisB,size_t(N)*48,cudaMemcpyHostToDevice,0));
    P.root=rootRef;
    {
        const long long weight=(long long)(2+s.ao)*s.max_depth;
        long long samplesPerLaunch=std::max(1LL,48000000LL/weight);
        int blocksPerLaunch=int(std::max(1LL,samplesPerLaunch/bs));
        for(int off=0;off<nblocks;off+=blocksPerLaunch){
            int nb=std::min(blocksPerLaunch,nblocks-off);
            trace_kernel<<<nb,bs>>>(P,d_nodes,d_trisB,d_trisO,d_mats,out,off,sg,lg,d_rec);
        }
    }
    TICK("launch")
#ifdef DEVTIME
    cudaDeviceSynchronize();TICK("gpu")
    fprintf(stderr,"nodes=%d rec=%d ",nodeCount,P.rec);
#endif
    ck(cudaGetLastError());
}

"""Seeded, code-drawn landscape prints. No external pictures or models are used."""
from pathlib import Path
import math
import random
import cv2
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets'/'scenes'
OUT.mkdir(parents=True,exist_ok=True)


def rgb(c):
    if isinstance(c,str):
        c=c.lstrip('#')
        return np.array([int(c[i:i+2],16) for i in (0,2,4)],np.float32)
    return np.asarray(c,np.float32)


def mix(a,b,k):
    if isinstance(k,np.ndarray) and k.ndim==2:k=k[...,None]
    return rgb(a)*(1-k)+rgb(b)*k


def ink(c):
    return tuple(map(int,np.clip(rgb(c),0,255)))


def noise(w,h,nx,ny,seed):
    rng=np.random.default_rng(seed)
    source=rng.random((max(2,ny),max(2,nx)),dtype=np.float32)
    return cv2.resize(source,(w,h),interpolation=cv2.INTER_CUBIC)


def fbm(w,h,nx,ny,seed,n=6):
    f=np.zeros((h,w),np.float32)
    for i in range(n):
        f+=(noise(w,h,nx*2**i,ny*2**i,seed+31*i)-.5)*.51**i
    return f


def bezier(a,b,c,d,n=60):
    t=np.linspace(0,1,n)[:,None]
    return (1-t)**3*np.array(a)+3*(1-t)**2*t*np.array(b)+3*(1-t)*t**2*np.array(c)+t**3*np.array(d)


def curve(*parts):
    return np.vstack([bezier(*part) for part in parts])


class Print:
    def __init__(self,wide,seed):
        self.w=2350 if wide else 1090
        self.h=1000
        self.scale=1.35
        self.W=round(self.w*self.scale);self.H=round(self.h*self.scale)
        self.y,self.x=np.mgrid[:self.H,:self.W].astype(np.float32)/self.scale
        self.r=random.Random(seed);self.seed=seed
        self.img=np.zeros((self.H,self.W,3),np.uint8)

    def pts(self,pts):
        return np.int32(np.rint(np.asarray(pts)*self.scale))

    def fill(self,pts,c):
        cv2.fillPoly(self.img,[self.pts(pts)],ink(c),lineType=cv2.LINE_AA)

    def line(self,pts,c,w=1):
        cv2.polylines(self.img,[self.pts(pts)],False,ink(c),max(1,round(w*self.scale)),cv2.LINE_AA)

    def dot(self,x,y,r,c):
        cv2.circle(self.img,(round(x*self.scale),round(y*self.scale)),max(1,round(r*self.scale)),ink(c),-1,cv2.LINE_AA)

    def box(self,x,y,w,h,c):
        self.fill([(x,y),(x+w,y),(x+w,y+h),(x,y+h)],c)

    def blend(self,color,k):
        self.img=np.uint8(np.clip(mix(self.img,color,np.clip(k,0,1)),0,255))

    def finish(self,name):
        # Ink tooth, a very fine diagonal screen, local paper density and sparse dust.
        h,w=self.H,self.W
        rng=np.random.default_rng(self.seed+88)
        g=rng.normal(0,2.9,(h,w)).astype(np.float32)
        g+=fbm(w,h,16,9,self.seed)*4.5
        g+=np.sin(self.x*1.15+self.y*1.6)*.95
        arr=np.clip(self.img.astype(np.float32)+g[...,None],0,255)
        self.img=arr.astype(np.uint8)
        for _ in range(int(self.w*.28)):
            x=self.r.uniform(0,self.w);y=self.r.uniform(0,self.h)
            col=self.img[min(int(y*self.scale),h-1),min(int(x*self.scale),w-1)]
            self.line([(x,y),(x+self.r.uniform(.4,4.2),y-.35)],mix(col,'efeed9',self.r.uniform(.12,.45)),.75)
        Image.fromarray(self.img).save(OUT/name,quality=93,method=5)


def terrain(p,colors,base=1080,span=420,relief=270,seed=22):
    """Project a ridged height field and invert its visible envelope per screen column."""
    D=680; W=p.W
    z=np.linspace(0,1,D,dtype=np.float32)[:,None]
    x=np.linspace(0,p.w/1000,W,dtype=np.float32)[None,:]
    field=fbm(W,D,round(8*p.w/1000),7,seed)
    ridge=(1-np.abs(field+.18*np.cos(x*14+z*14)))**2
    envelope=.28+.72*np.exp(-((z-.80)/.32)**2)
    hills=.77+.31*np.sin(12*x+4*z)+.27*np.cos(6.4*x-5*z)+.1*np.sin(21*x-2*z)
    land=(ridge*.59+hills*.52)*relief*envelope
    proj=(base-span*z-land)*p.scale
    visible=np.minimum.accumulate(proj,axis=0)
    slopez,slopex=np.gradient(land)
    light=np.tanh(slopex*p.scale*.8+slopez*1.2)
    value=np.clip(.44+.32*light+.23*field+.055*np.sin(land*.24+field*8),0,1)
    color=mix(colors[0],colors[1],value)
    color=mix(color,colors[2],np.broadcast_to(z*.59,light.shape))
    out=np.empty((p.H,p.W),np.int32)
    levels=np.arange(D); yy=-np.arange(p.H)
    for col in range(W):
        out[:,col]=np.interp(yy,-visible[:,col],levels)
    pixels=color[out,np.arange(W)[None,:]]
    mask=p.y*p.scale>=visible[-1][None,:]
    p.img[mask]=np.uint8(np.clip(pixels[mask],0,255))


def beam(p,a,b,t,palette):
    a,b=np.array(a),np.array(b);v=b-a
    n=np.array([-v[1],v[0]])/np.linalg.norm(v)*t/2
    p.fill([a+n,b+n,b-n,a-n],palette[0])
    p.line([a-n*.9,b-n*.9],palette[1],max(.9,t*.14))


def girder(p,x1,y1,x2,y2,depth,palette,n=10):
    a=np.array([x1,y1],float);b=np.array([x2,y2],float)
    s=np.array([0,depth])
    for i in range(n):
        u=a+(b-a)*i/n;v=a+(b-a)*(i+1)/n
        beam(p,u+s,v,depth*.14,palette)
        if i%3==0:beam(p,u,v+s,depth*.11,palette)
        beam(p,u,u+s,depth*.13,palette)
    beam(p,a,b,depth*.23,palette);beam(p,a+s,b+s,depth*.22,palette)


def factory_box(p,x,y,w,d,h,cols,detail=True):
    """Oblique block: roof, sunward end and shaded long wall."""
    dx=d*.83;dy=-d*.49
    p.fill([(x,y),(x+w,y),(x+w,y-h),(x,y-h)],cols[0])
    p.fill([(x+w,y),(x+w+dx,y+dy),(x+w+dx,y+dy-h),(x+w,y-h)],cols[1])
    p.fill([(x,y-h),(x+w,y-h),(x+w+dx,y+dy-h),(x+dx,y+dy-h)],cols[2])
    p.line([(x,y-h),(x+w,y-h),(x+w+dx,y+dy-h)],mix(cols[2],'e1cea0',.25),1.2)
    if not detail:return
    # The wall plates carry vertical seams and inset window bands.
    for sx in np.arange(x+9,x+w,13):
        p.line([(sx,y-h+4),(sx,y-2)],mix(cols[0],cols[1],.42),1.2)
    for z in np.arange(11,h-2,16):
        for sx in np.arange(x+5,x+w-7,14):
            c=mix(cols[0],cols[2],p.r.uniform(.14,.65))
            p.box(sx,y-z-3,p.r.uniform(4,10),p.r.uniform(1.6,3.8),c)
    if d>17:
        p.line([(x+w+3,y-h+8),(x+w+dx-2,y-h+dy+8)],cols[0],2.1)


def derrick(p,x,base,height,width,cols):
    # Freestanding extraction tower. The taper, cross-bracing and platforms share one axis.
    dx=width*.23;dy=-width*.14
    def left(t):return np.array([x-width*(.53-.34*t),base-t*height])
    def right(t):return np.array([x+width*(.54-.34*t),base-t*height])
    side=np.array([dx,dy]);pal=(cols[0],cols[2]);shade=(cols[1],cols[0])
    for t in np.linspace(0,1,12)[:-1]:
        u=t+1/11
        beam(p,left(t)+side,right(u)+side,width*.055,shade)
        beam(p,right(t)+side,left(u)+side,width*.05,shade)
    beam(p,right(0)+side,right(1)+side,width*.089,shade)
    for t in np.linspace(0,1,12)[:-1]:
        u=t+1/11
        l,r=left(t),right(t);l2,r2=left(u),right(u)
        for a,b,ww in [(l,r2,.054),(r,l2,.049),(r,r2+side,.065),(l,r,.069),(r,r+side,.063)]:
            beam(p,a,b,width*ww,pal)
        if round(t*11)%3==1:
            factory_box(p,l[0]-6,l[1]+3,r[0]-l[0]+12,width*.32,6,cols,False)
            for v in np.linspace(l[0]-4,r[0]+4,8):p.line([(v,l[1]-3),(v,l[1]-13)],cols[0],1.3)
            p.line([(l[0]-4,l[1]-13),(r[0]+4,l[1]-13)],cols[0],1.4)
    beam(p,left(0),left(1),width*.116,pal);beam(p,right(0),right(1),width*.116,pal)
    l=left(.70);r=right(.70)
    factory_box(p,l[0]-width*.06,l[1],r[0]-l[0]+width*.12,width*.41,height*.11,cols)
    tip=left(1)
    factory_box(p,tip[0]-width*.07,tip[1]+6,width*.54,width*.43,height*.067,cols)
    p.line([(x,tip[1]-height*.067),(x+3,tip[1]-height*.14)],cols[0],2.5)
    p.line([(x-4,tip[1]-height*.12),(x+12,tip[1]-height*.12)],cols[2],1.4)
    # Cage ladder is continuous from the lower platform to the operator cab.
    a=right(.14)+[2,0];b=right(.91)+[2,0]
    p.line([a,b],cols[2],1);p.line([a+[7,0],b+[7,0]],cols[2],1)
    for f in np.linspace(0,1,42):
        q=a+(b-a)*f;p.line([q,q+[7,0]],cols[2],1)


def industrial_scene(wide):
    p=Print(wide,18);w=p.w;r=p.r
    k=np.clip(p.y/1050+.1*np.sin(p.x/680),0,1)
    sky=mix('e2b941','f4d77f',k)
    cloud=fbm(p.W,p.H,4,18,28)*6
    p.img=np.uint8(np.clip(sky+cloud[...,None],0,255))
    # Screen-printed solar disc and fine survey traces.
    cx=w*(.31 if wide else .24);cy=237;rad=125
    ds=np.hypot(p.x-cx,p.y-cy)
    p.blend('f9dfa1',np.clip(rad-ds,0,1)*.73)
    for i in range(4):
        a=np.linspace(-.99,2.6,130);rr=rad+12+i*10
        p.line(np.stack([cx+rr*np.cos(a),cy+rr*np.sin(a)],1),'dcc077',.7)
    for _ in range(29):
        x=r.uniform(-100,w);y=r.uniform(120,545)
        p.line([(x,y),(x+r.uniform(20,122),y-r.uniform(0,2))],'ebcb75',r.uniform(.7,2))
    terrain(p,('4b4a35','ba9f5d','ebcc83'),1125,525,244,91)
    # Distant valley pylons and their hanging conductors.
    last=None
    for i,x in enumerate(np.linspace(-20,w+35,8)):
        y=575+26*math.sin(i*1.2);h=110+22*math.cos(i)
        co=('777558','b8ab74')
        for a,b in [((x-12,y),(x-2,y-h)),((x+12,y),(x+2,y-h)),((x-18,y-h+16),(x+18,y-h+16)),((x-14,y-h+35),(x+14,y-h+35))]:
            beam(p,a,b,2.5,co)
        for j in range(4):
            t=j/4;xx=12-t*9;p.line([(x-xx,y-h*t),(x+xx-2,y-h*(t+.25)),(x-xx+2,y-h*(t+.25))],co[0],1.3)
        if last:
            lx,ly=last
            for off in (0,6):p.line(bezier((lx,ly+off),(lx+48,ly+32+off),(x-48,y-h+55+off),(x,y-h+18+off)),co[0],.85)
        last=x,y-h+18
    # A pale second installation is visible behind the main rig.
    derrick(p,w*.16,656,336,61,('6c6950','999064','c4b371'))
    middle=('575646','393e35','bca774')
    for i in range(round(w/30)):
        x=r.uniform(-75,w);y=r.uniform(665,741)
        ww=r.uniform(15,64);hh=r.uniform(15,60)
        factory_box(p,x,y,ww,r.uniform(10,26),hh,middle,True)
        if i%5==0:
            p.box(x+ww*.43,y-hh-r.uniform(27,62),6,63,middle[1])
    cols=('353b32','222b28','9c905a')
    # A projecting rail on the upper service gantry makes the silhouette legible from far away.
    gx=w*(.86 if not wide else .83); gy=759; gh=535
    derrick(p,gx,gy,gh,117,cols)
    girder(p,gx-202,gy-gh+24,gx+64,gy-gh-1,18,cols,12)
    p.line([(gx+5,gy-gh-62),(gx-184,gy-gh+26)],cols[0],2)
    p.line([(gx+5,gy-gh-62),(gx+60,gy-gh-1)],cols[0],2)
    for xx in [gx-151,gx-146]:p.line([(xx,gy-gh+39),(xx,gy-gh+102)],cols[1],1)
    p.fill([(gx-159,gy-gh+102),(gx-140,gy-gh+102),(gx-143,gy-gh+111),(gx-154,gy-gh+112)],cols[0])
    # Railway conveyors and pipe racks, diminishing into the pass.
    girder(p,-19,823,w*.72,642,28,cols,round(w*.026))
    for xx in np.linspace(0,w*.7,9):
        y=822-180*(xx/(w*.72))
        beam(p,(xx,y+16),(xx-7,y+126),8,cols);beam(p,(xx+18,y+16),(xx+22,y+120),7,cols)
    front=('373b32','242c27','a39868')
    for x,y,ww,d,h in [(-95,888,230,89,129),(87,883,134,82,82),(w*.79,854,183,57,75),(w*.86,790,105,63,101)]:
        factory_box(p,x,y,ww,d,h,front)
        factory_box(p,x+ww*.28,y-h-7,ww*.28,d*.5,24,front)
        for off in (0,8,16):
            p.line([(x+8+off,y-29),(x+ww-11+off,y-29),(x+ww+21+off,y-50)],'#b5a66b',2.4)
    # Nearest excavated bench; its surface is cut by parallel drill marks.
    xx=np.linspace(-3,w+3,600)
    crest=863+47*np.sin(xx/210)+25*np.cos(xx/105)+9*np.sin(xx/19)+3*np.sin(xx/3)
    p.fill(np.vstack((np.stack((xx,crest),1),[(w+4,1002),(-5,1002)])),'30372e')
    for i in range(int(w*.72)):
        x=r.uniform(0,w);y=np.interp(x,xx,crest)+r.expovariate(.022)
        p.line([(x,y),(x-r.uniform(1,17),y+r.uniform(.2,4))],r.choice(['52533d','6a6144','444a36']),r.uniform(.5,2.7))
    # Structural section protruding from the near left edge.
    beam(p,(-63,996),(w*.235,770),28,('292f28','9c8a54'))
    beam(p,(-64,1038),(w*.24,799),19,('252c26','716b49'))
    p.finish(('endfield-wide' if wide else 'endfield')+'.webp')


def train(p):
    w=p.w
    def road(x):
        return 884-.105*x+45*math.sin(x/(w*.69)+.12)
    x=np.linspace(-4,w+4,300)
    for offset,color,width in [(65,'232035',6),(53,'8f7b86',1.1),(29,'484052',3),(7,'b9a49b',2.4),(2,'695766',2.8)]:
        p.line([(u,road(u)+offset) for u in x],color,width)
    for xx in np.arange(-20,w+10,18):
        p.line([(xx,road(xx)+8),(xx-18,road(xx)+26)],'948391',1.1)
    # Passenger windows remain separately legible in the panoramic print.
    cx=-52
    while cx<w*.46:
        length=92;yy=road(cx)-2;dy=road(cx+length)-road(cx)
        p.fill([(cx,yy-24),(cx+6,yy-30),(cx+length-6,yy+dy-30),(cx+length,yy+dy-24),
                (cx+length,yy+dy-5),(cx+length-7,yy+dy),(cx+3,yy-1)],'272536')
        p.line([(cx+3,yy-26),(cx+length-8,yy+dy-28),(cx+length-1,yy+dy-24)],'b7a393',2.7)
        p.line([(cx+2,yy-6),(cx+length-2,yy+dy-6)],'b5a196',1.2)
        for j in range(7):
            u=cx+9+j*11;yp=road(u)-23
            p.fill([(u,yp),(u+6.4,yp-.65),(u+6.4,yp+7),(u,yp+7.6)],p.r.choice(['debd90','ae9591','f1cf9e']))
        p.dot(cx+12,yy-2,3.6,'141a2c');p.dot(cx+length-12,yy+dy-2,3.5,'141a2c')
        p.line([(cx+length,yy+dy-9),(cx+length+5,yy+dy-9)],'71647b',2)
        cx+=97
    # Streamlined observation engine.
    yy=road(cx)
    p.fill([(cx,yy-5),(cx,yy-28),(cx+15,yy-35),(cx+43,yy-37),(cx+51,yy-30),
            (cx+75,yy-28),(cx+102,yy-14),(cx+99,yy-11),(cx+44,yy-4)],'2b2b3d')
    p.line([(cx,yy-28),(cx+20,yy-36),(cx+45,yy-37),(cx+73,yy-28),(cx+102,yy-14)],'d2b99b',2.6)
    p.fill([(cx+18,yy-31),(cx+42,yy-33),(cx+49,yy-27),(cx+18,yy-25)],'cdb7a0')
    p.line([(cx+52,yy-18),(cx+91,yy-18)],'b2a2b0',2.3)
    p.dot(cx+96,yy-17,2.1,'f3dbb4')


def space_scene(wide):
    p=Print(wide,62);w=p.w;r=p.r
    x,y=p.x,p.y
    band=np.exp(-((y-(520-x*.55))/143)**2)
    field=fbm(p.W,p.H,10 if not wide else 20,12,68)
    cosmos=mix('151829','47354f',np.clip(.30+.26*y/1000+field*.10+band*.30,0,1))
    dust=np.maximum(0,field+.42)**1.8*band
    cosmos+=dust[...,None]*np.array([66,48,79])
    cosmos+=np.exp(-((y-845)/210)**2)[...,None]*np.array([16,11,22])
    p.img=np.uint8(np.clip(cosmos,0,255))
    for _ in range(round(w*3.1)):
        xx=r.uniform(-1,w);yy=r.uniform(0,1000)
        rr=min(2.7,r.expovariate(2.8)+.23)
        col=mix('51495f',r.choice(['efe2ce','adafdb','d0c1e2']),r.random()**1.5)
        p.dot(xx,yy,rr,col)
        if rr>2:
            p.line([(xx-rr*3.2,yy),(xx+rr*3.2,yy)],mix(col,'362e44',.32),.8)
            p.line([(xx,yy-rr*3.2),(xx,yy+rr*3.2)],mix(col,'362e44',.32),.8)
    # Faint navigational plates, with interrupted meridians.
    for i in range(4):
        a=np.linspace(-2.93+i*.12,.07-i*.07,250)
        p.line(np.stack((w*.26+(530+i*16)*np.cos(a),573+(420+i*14)*np.sin(a)),1),
               ('484250','514855','473d4c','413a47')[i],.75)
    starpts=[(.03,370),(.105,348),(.133,245),(.218,204),(.234,120),(.185,93)]
    p.line([(u*w,v) for u,v in starpts],'776b7a',.9)
    for u,v in starpts:
        p.dot(u*w,v,2.7,'d3c5bd')
        p.dot(u*w+6,v+8,1,'746778')
    # The planet is lit in sphere coordinates; latitude bands bend around its limb.
    cx=w*(.77 if not wide else .76);cy=280;rad=209 if wide else 213
    dx=(x-cx)/rad;dy=(y-cy)/rad
    rr=np.hypot(dx,dy);limb=np.maximum(0,1-rr*rr)
    zz=np.sqrt(limb)
    theta=-.385;ct=np.cos(theta);st=np.sin(theta)
    u=dx*ct+dy*st;v=-dx*st+dy*ct
    ring_r=np.sqrt(u*u+(v/.238)**2)
    rband=np.clip((ring_r-1.24)*85,0,1)*np.clip((2.24-ring_r)*50,0,1)
    bands=(.56+.17*np.sin(ring_r*36)+.095*np.sin(ring_r*183)+.12*np.sin(ring_r*76))*(1-.84*np.exp(-((ring_r-1.83)/.027)**2))
    bands*=.78+.22*np.cos(ring_r*16)**2
    ringcol=mix('a795af','f5dbcf',np.clip(.37+.35*np.sin(ring_r*75)+.25*np.sin(ring_r*134),0,1))
    p.blend(ringcol,rband*bands)
    p.blend('9c8ebc',np.exp(-((rr-1)/.072)**2)*.25)
    lon=np.arctan2(dx,zz+.001)
    lat=np.arcsin(np.clip(dy*.93+dx*.12-zz*.18,-1,1))
    moire=noise(p.W,p.H,23 if wide else 12,56,81)
    wrinkle=.7*np.sin(lon*4+lat*48)+.36*np.cos(lon*7-lat*30)+.27*moire
    storm=np.exp(-((lon+.24)/.38)**2-((lat+.34)/.07)**2)
    pigment=.48+.20*np.sin(lat*31+wrinkle+storm*3)+.10*np.sin(lat*124+wrinkle*1.5)+.05*np.cos(lat*217+lon*3)+.12*field
    daylight=np.clip(-dx*.72-dy*.60+zz*.31,0,1)
    vapor=mix('9883aa','efc8c4',np.clip(pigment,0,1))
    ball=mix('39354e',vapor,np.clip(.10+.90*daylight**.66,0,1))
    ball+=np.exp(-((rr-.994)/.022)**2)[...,None]*np.clip(-dx*.65-dy*.7+.34,0,1)[...,None]*np.array([57,44,57])
    shadow=(v>-.08)&(v<.035)&(u>.14)
    ball*=1-shadow[...,None]*.13
    p.blend(ball,np.clip((1-rr)*rad,0,1))
    p.blend(ringcol,rband*bands*(v>0))
    # Threads of dust between the dominant rings.
    for radius in (1.18,1.225,2.29,2.33):
        a=np.linspace(0,math.pi,300)
        ex=radius*rad*np.cos(a);ey=radius*rad*.238*np.sin(a)
        p.line(np.stack((cx+ex*ct-ey*st,cy+ex*st+ey*ct),1),'bba7bb',.75)
    # The companion moon and its small phase crescent.
    mx=w*.192;my=183;mr=18.5
    mdx=(x-mx)/mr;mdy=(y-my)/mr;md=np.hypot(mdx,mdy)
    mlight=np.clip(-mdx*.8-mdy*.55+np.sqrt(np.maximum(0,1-md*md))*.28,0,1)
    p.blend(mix('40364b','c0aab7',mlight),np.clip((1-md)*mr,0,1))
    for i in range(19):
        off=r.uniform(-11,38);alpha=r.random()
        streak=bezier((-60,958+off),(w*.32,923+off),(w*.74,731+off*.5),(w+65,648+off))
        p.line(streak,mix('3b334c','9b8389',alpha*.55),r.uniform(.7,2.4))
    train(p)
    # Sparse plotted points over the dark lower field.
    for i in range(42):
        xx=r.uniform(0,w);yy=r.uniform(905,1000)
        p.line([(xx-2,yy),(xx+2,yy)],'96869e',.7);p.line([(xx,yy-2),(xx,yy+2)],'96869e',.7)
    p.finish(('starrail-wide' if wide else 'starrail')+'.webp')


def waterline(p,ybase,amp,col,n=4):
    xs=np.linspace(-4,p.w+4,520)
    y=ybase+amp*(.45*np.sin(xs/(p.w*.095)+n)+.28*np.sin(xs/51+n*1.3)+.23*np.cos(xs/96-n))
    p.fill(np.vstack([np.stack([xs,y],1),[[p.w+4,1004],[-4,1004]]]),col)
    return xs,y


def curling_water(p,cx,top,scale,mirror=False):
    """An overhanging breaker: flowing hatching is clipped to the same water boundary."""
    r=p.r;s=scale
    def world(pts):
        v=np.array(pts,dtype=float)
        v[...,0]=cx+v[...,0]*s*(-1 if mirror else 1)
        v[...,1]=top+v[...,1]*s
        return v
    outline=curve(
        ((-1240,605),(-940,478),(-568,705),(-256,531)),
        ((-256,531),(-69,427),(56,199),(-26,120)),
        ((-26,120),(-56,87),(-119,106),(-106,185)),
        ((-106,185),(-182,144),(-153,22),(-49,-2)),
        ((-49,-2),(61,-38),(165,42),(280,195)),
        ((280,195),(389,329),(557,430),(840,324)),
        ((840,324),(992,207),(1440,300),(1660,370)))
    poly=np.vstack([outline,[(1660,1550),(-1240,1550)]])
    mask=np.zeros((p.H,p.W),np.uint8)
    cv2.fillPoly(mask,[p.pts(world(poly))],255,lineType=cv2.LINE_AA)
    before=p.img.copy()
    X=(p.x-cx)/s*(-1 if mirror else 1);Y=(p.y-top)/s
    c=np.clip(.50+.31*np.cos(X/190+Y/318)+.135*np.sin(Y/63-X/237)+.11*fbm(p.W,p.H,11,8,84),0,1)
    c*=.60+.4*np.exp(-((Y-120)/395)**2)
    p.img=np.uint8(mix('0e4148','71b7ab',c))
    # Back of the wave: fine curling strands spreading toward the foot.
    for i in range(265):
        start=r.uniform(-82,190);end=r.uniform(220,1490)
        pts=bezier((start,6+(start-10)**2*.0017+r.uniform(-12,11)),
                   (start+175,65+r.uniform(-35,67)),(end-190,595+r.uniform(-120,107)),
                   (end,525+r.uniform(-80,195)),95)
        wig=r.uniform(0,6);pts[:,1]+=np.sin(np.linspace(0,r.uniform(5,12),len(pts))+wig)*wig
        col=mix('216168','aedbd0',r.random()**1.6)
        if i%6==0:
            a=r.randrange(15,62);pts=pts[a:a+r.randrange(11,32)]
        p.line(world(pts),col,r.uniform(.65,2.9)*s)
    # The concave face has a different direction field: each line turns back into the nozzle.
    for i in range(210):
        q=i/209
        edge=-20+q*166;off=r.uniform(-12,12)
        bottom=612+q*287+off
        start=-1090+q*692
        a=bezier((start,bottom),(-237,bottom+54),(edge+156,428+q*78),(edge+32,164+q*7),125)
        b=bezier((edge+32,164+q*7),(edge-16,-24+q*55),(-173+q*54,19+q*42),(-111+q*7,166+q*32),80)
        pts=np.vstack((a,b))
        phase=r.uniform(0,7);tt=np.linspace(0,1,len(pts))
        pts[:,0]+=np.sin(tt*27+phase)*r.uniform(.3,2.7)
        pts[:,1]+=np.sin(tt*24+phase*.72)*r.uniform(.5,3)
        tone=r.random()
        col=mix('1b555d','c6dfce',tone**1.8)
        if i%5==0:
            a=r.randrange(160);pts=pts[a:a+r.randrange(6,37)]
        p.line(world(pts),col,r.uniform(.45,2.8)*s)
    # Engraved white eddies: lines split into small broken scales on the slope.
    for _ in range(910):
        u=r.uniform(0,1);v=r.random()
        xx=30+u*817;yy=80+u*493+v*184-87*math.cos(u*7)
        ln=r.uniform(2,17)
        p.line(world([(xx,yy),(xx+ln*.52,yy+ln*.21),(xx+ln,yy+ln*.22)]),
               mix('79b7aa','cce3d3',r.random()*.75),r.uniform(.5,1.7)*s)
    p.img=np.uint8(p.img*(mask[...,None]/255)+before*(1-mask[...,None]/255))
    # Foam accumulates along the breaking lip, with branching spray and teardrop-shaped ends.
    edge=curve(((-106,181),(-163,132),(-145,29),(-45,1)),((-45,1),(41,-29),(130,17),(225,120)))
    for i in range(160):
        n=r.randrange(1,len(edge)-2);a=edge[n]
        size=r.uniform(3,12)*(1.2-.44*n/len(edge));off=r.uniform(-8,8)
        x=a[0];y=a[1]+off
        col=r.choice(['c5dfcc','d7e6cc','92c5b6','aecfc0'])
        p.dot(*world((x,y)),size*s,col)
        if i%2==0:
            ex=x-r.uniform(4,23);ey=y-r.uniform(5,30)
            pts=bezier((x,y),(x-size*1.1,y-16),(ex-3,ey-9),(ex,ey),25)
            p.line(world(pts),col,r.uniform(1.4,3.4)*s)
            p.dot(*world((ex,ey)),r.uniform(1.2,3.2)*s,col)
    for _ in range(360):
        n=r.randrange(len(edge));a=edge[n];d=r.expovariate(.037)
        xx=a[0]-d*r.uniform(.2,1.7)+r.gauss(0,9);yy=a[1]-d*r.uniform(.4,2.1)+r.uniform(-5,8)
        p.dot(*world((xx,yy)),min(4,r.expovariate(.85)+.4)*s,r.choice(['cee0c9','c0ddce','d9e6d2','95c4b5']))


def tide_scene(wide):
    p=Print(wide,83);w=p.w;r=p.r
    fog=np.clip(.13+.72*p.y/880+.1*np.sin(p.x/567)+.075*fbm(p.W,p.H,5,12,85),0,1)
    p.img=np.uint8(mix('357679','b8cdaf',fog))
    mx=w*(.245 if not wide else .22);my=224;mr=100
    mm=np.hypot(p.x-mx,p.y-my)
    surf=fbm(p.W,p.H,22,19,81);moon=mix('bed8c5','e5e9c9',np.clip(.58+surf*.67,0,1))
    p.blend(moon,np.clip(mr-mm,0,1)*.94)
    for i in range(5):
        rr=mr+13+i*10
        a=np.linspace(-1.87+i*.16,2.64-i*.26,180)
        p.line(np.stack((mx+rr*np.cos(a),my+rr*np.sin(a)),1),mix('7ca7a0','adbdab',i*.09),.85)
    # A distant, drowned coast. Narrow silhouettes dissolve into the vapour.
    for layer in range(3):
        xx=np.linspace(-8,w+8,round(w))
        ridge=np.zeros_like(xx)
        for _ in range(29):
            x=r.uniform(-90,w+90);ht=r.uniform(15,136);rw=r.uniform(9,60)
            ridge+=np.maximum(0,1-abs(xx-x)/rw)**1.23*ht
        yy=570+58*layer-ridge*(.45+.18*layer)+np.sin(xx*.046)*7
        p.fill(np.vstack((np.stack((xx,yy),1),[(w+8,1005),(-8,1005)])),mix('87aaa0','477f7d',layer*.3))
    # Slender ruined markers recede toward the horizon.
    for j in range(13):
        xx=w*.07+j*w*.019;hh=40+88*(.5+.5*math.sin(j*4.2+2))**3;yb=575+13*math.sin(j)
        ww=7+r.random()*6
        p.fill([(xx-ww,yb),(xx-ww*.4,yb-hh*.72),(xx-ww*.8,yb-hh*.77),(xx+2,yb-hh),(xx+ww*.5,yb-hh*.61),(xx+ww,yb)],'608d85')
        p.line([(xx+2,yb-hh),(xx+1,yb-hh*.4)],'a9bda9',1.2)
    for i in range(42):
        y=576+i*4.5;xx=r.uniform(-10,w)
        p.line([(xx,y),(xx+r.uniform(16,128),y-r.uniform(.1,2.2))],r.choice(['96b8a8','a4c2b1','76a495']),1.2)
    waterline(p,723,49,'548d86',2)
    # Secondary swell and the large breaking surface have different wind directions.
    curling_water(p,w*.10,542,.45,True)
    curling_water(p,w*(.748 if not wide else .78),232,.88 if not wide else 1.07)
    # A foreground wash, close enough to see the printing of alternating lines.
    xs,ys=waterline(p,909,54,'19494d',8)
    for i in range(60):
        off=i*3
        pts=np.stack((xs,ys+off+np.sin(xs/76+i*.083)*i*.37),1)
        p.line(pts,mix('245456','719d8f',r.random()*.75),r.uniform(.55,1.7))
    for i in range(1200):
        xx=r.uniform(0,w);yy=922+r.uniform(-34,90)+27*math.cos(xx/109)
        if yy<np.interp(xx,xs,ys):continue
        length=r.expovariate(.18)+1
        p.line([(xx,yy),(xx+length,yy-.18*length)],r.choice(['63978e','7ba598','386b6b']),1)
    p.finish(('waves-wide' if wide else 'waves')+'.webp')


if __name__=='__main__':
    for scene in (industrial_scene,space_scene,tide_scene):
        for wide in (False,True):
            scene(wide)
            print(scene.__name__, 'panorama' if wide else 'cover',flush=True)

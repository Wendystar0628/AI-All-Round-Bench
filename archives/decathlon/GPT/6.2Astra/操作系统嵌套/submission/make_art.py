"""Original vector landscape, drawn in six depth planes with seeded terrain."""
import math, random
from pathlib import Path
r=random.Random(24)
s=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 940" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sky" x2=".9" y2="1"><stop stop-color="#233f42"/><stop offset=".6" stop-color="#74918c"/><stop offset="1" stop-color="#ddd9b2"/></linearGradient><linearGradient id="v"><stop stop-color="#102a2e" stop-opacity=".45"/><stop offset=".65" stop-color="#223a3b" stop-opacity="0"/></linearGradient><pattern id="grain" width="170" height="170" patternUnits="userSpaceOnUse"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="170" height="170" filter="url(#n)" opacity=".34"/></pattern></defs><rect width="1600" height="940" fill="url(#sky)"/>']
def line(pts,c,w=1,opacity=1):
 s.append('<path d="M'+' L'.join('%g %g'%p for p in pts)+'" fill="none" stroke="%s" stroke-width="%g" opacity="%g"/>'%(c,w,opacity))
def poly(pts,c):
 s.append('<path d="M'+' L'.join('%g %g'%p for p in pts)+' Z" fill="'+c+'"/>')
s.append('<circle cx="1208" cy="223" r="74" fill="#efdfa6"/><circle cx="1208" cy="223" r="83" fill="none" stroke="#e6e0bf" opacity=".32"/>')
for i in range(125):
 x,y=r.uniform(-80,1600),r.uniform(40,440)
 line([(x,y),(x+r.uniform(8,150),y+r.uniform(-1,1))],'#f5ebc4',r.uniform(.3,2),r.uniform(.04,.22))
def height(x,points):
 for (a,b),(c,d) in zip(points,points[1:]):
  if a<=x<=c:return b+(d-b)*(x-a)/(c-a)
 return points[-1][1]
def ridge(points,col,amp,step=5):
 pts=[(x,height(x,points)+amp*(math.sin(x*.065)*.32+math.sin(x*.016)*.5+r.uniform(-.2,.2))) for x in range(0,1601,step)]
 poly(pts+[(1600,940),(0,940)],col)
 return pts
ridge([(0,490),(220,380),(375,459),(590,310),(725,389),(900,235),(1010,315),(1180,226),(1330,360),(1520,272),(1600,330)],'#a6b7a9',13)
ridge([(0,492),(105,416),(255,466),(440,387),(565,428),(795,294),(875,353),(946,265),(1115,189),(1160,244),(1230,285),(1400,194),(1510,300),(1600,236)],'#819990',14)
def mountain(x,peak,y,span,base):
 # faceted snow cap and parallel mineral seams
 top=(peak,y);left=(x,base);right=(peak+span,base+55)
 points=[left,(peak-span*.57,y+(base-y)*.57),(peak-span*.45,y+(base-y)*.53),(peak-span*.22,y+(base-y)*.26),(peak-span*.16,y+(base-y)*.28),top,(peak+span*.12,y+(base-y)*.16),(peak+span*.18,y+(base-y)*.18),right]
 poly(points,'#abafa0')
 lip=[top,(peak-8,y+35),(peak+18,y+69),(peak+10,y+100),(peak+53,y+131),(peak+71,base)]
 poly(lip+[right]+list(reversed(points[6:-1])),'#576f6b')
 for i in range(54):
  u=r.uniform(.04,.91); sx=peak+(x-peak)*u;sy=y+(base-y)*u+r.uniform(2,29)
  ex=sx-r.uniform(6,66);ey=sy+r.uniform(15,95)
  poly([(sx,sy),(sx+r.uniform(3,14),sy+r.uniform(0,12)),(ex,ey)],r.choice(['#c7c6b2','#dcd6b9','#82958a','#92a197']))
 for i in range(35):
  u=r.random(); sx=peak+span*u*.86;sy=y+(base+55-y)*u+r.uniform(7,48)
  line([(sx,sy),(sx+12,sy+20),(sx+19,sy+41)],'#94a497',r.uniform(1,5),.5)
mountain(480,810,308,230,515);mountain(695,1042,204,316,511);mountain(938,1260,271,260,540);mountain(1230,1532,217,285,508)
ridge([(0,517),(150,447),(305,483),(510,409),(672,487),(839,416),(990,497),(1220,444),(1380,475),(1600,390)],'#708c7d',12)
def trees(pts,colors,spacing,lo,hi):
 for x in range(0,1600,spacing):
  xx=x+r.uniform(-2,2);y=height(x,pts)+4;h=r.uniform(lo,hi);w=h*r.uniform(.11,.18)
  poly([(xx,y-h),(xx+w*.45,y-h*.63),(xx+w*.3,y-h*.64),(xx+w*.8,y-h*.36),(xx+w*.56,y-h*.40),(xx+w,y-1),(xx,y-4),(xx-w,y),(xx-w*.56,y-h*.42),(xx-w*.73,y-h*.38),(xx-w*.3,y-h*.67),(xx-w*.46,y-h*.63)],r.choice(colors))
p=ridge([(0,550),(260,465),(460,494),(630,550),(810,536),(1000,561),(1280,515),(1440,530),(1600,461)],'#526f63',11);trees(p,['#526f63','#557468'],5,5,16)
ridge([(0,621),(215,570),(443,586),(630,567),(843,591),(1092,563),(1323,578),(1600,544)],'#b2b9a1',9)
for i in range(170):
 x,y=r.uniform(0,1600),r.uniform(577,671);line([(x,y),(x+r.uniform(6,70),y)],'#d1cfb0',1,.55)
p=ridge([(0,584),(170,604),(320,659),(480,696),(700,712),(1010,677),(1250,610),(1430,576),(1600,560)],'#405c50',10);trees(p,['#405c50','#486554'],5,9,39)
p=ridge([(0,641),(210,665),(390,704),(620,750),(850,756),(1070,701),(1330,634),(1600,615)],'#2f4940',14);trees(p,['#2f4940','#344e43'],7,10,61)
p=ridge([(0,705),(185,765),(460,815),(690,800),(920,793),(1120,757),(1370,716),(1600,653)],'#233e36',12);trees(p,['#233e36','#294238'],10,20,90)
# lookout station on ridge
for x in (1381,1400):line([(x,617),(x+(3 if x>1390 else -3),663)],'#273e37',3)
line([(1381,618),(1402,652),(1380,635),(1400,618)],'#273e37',2)
poly([(1374,604),(1390,594),(1409,604)],'#263e38');poly([(1378,605),(1406,605),(1406,617),(1378,617)],'#ded3a7')
for x in range(1378,1407,7):line([(x,605),(x,617)],'#324b40',2)
line([(1372,617),(1412,617)],'#273e37',4)
s.append('<rect width="1600" height="940" fill="url(#v)"/><rect width="1600" height="940" fill="url(#grain)" opacity=".15"/></svg>')
Path('highland.svg').write_text(''.join(s),encoding='utf8')

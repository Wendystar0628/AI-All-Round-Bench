"""Three alphabets drawn in a 100-unit cell. Coordinates describe strokes, not font text."""
from dataclasses import dataclass, field
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '素材' / '字形底座'))
from glyphbase import geom as G, Font


def P(*points):
    return G.polygon(points)


def shape(d):
    return G.from_svg_d(d)


@dataclass
class Letter:
    name: str
    hand: str
    weight: float = 1
    strokes: list = field(default_factory=list)
    accent: object = None

    def add(self, kind, path, motif=False):
        self.strokes.append((kind, path))
        if motif:
            self.accent = path
        return path

    def face(self):
        return G.union([p for _, p in self.strokes])

    def h(self, x, y, end, w=None):
        if self.hand == 'mill':
            t = (w or 10.4) * self.weight
            p = P((x+2.4,y-t/2),(end,y-t/2),(end,y+t/2-2.5),
                  (end-2.5,y+t/2),(x,y+t/2),(x,y-t/2+2.4))
            if end-x>18:
                p = G.diff(p,P((end-12,y-t/2-.4),(end-6.7,y-t/2-.4),(end-10.9,y-t/2+2)))
        else:
            t = (w or 3.5) * self.weight
            # A lightly rising copperplate horizontal. The point is the burin's exit.
            f = min(5, (end-x)*.15)*self.weight
            p = P((x-1,y-t*.48),(end-f*1.7,y-t*.48-.7),(end-f,y-f-.8),
                  (end+1.6,y+t*.48-.7),(x+1,y+t*.48))
        return self.add('横',p)

    def v(self, x, y, end, w=None):
        t=(w or (14.2 if self.hand=='mill' else 8.2))*self.weight
        if self.hand == 'mill':
            p=P((x-t/2+2.6,y),(x+t/2,y),(x+t/2,end-3),
                (x+t/2-3,end),(x-t/2,end),(x-t/2,y+2.6))
        else:
            p=P((x-t*.65,y-1.6),(x+t*.65,y+1.3),(x+t*.47,y+4),
                (x+t*.44,end-2),(x-t*.5,end+1),(x-t*.44,y+2.5))
            p=G.diff(p,P((x-t*.28,y+3),(x-t*.17,y+4),(x-t*.27,y+(end-y)*.61)))
        return self.add('竖',p)

    def bend(self, kind, pts, widths):
        sizes = [w*self.weight for w in widths]
        return self.add(kind, G.sweep(pts,sizes,join='bevel'))

    def ink(self, kind, d, motif=False):
        return self.add(kind,shape(d),motif)

    def slash(self,x,y,ex,ey,w,thin=1.4):
        return self.bend('撇' if ex<x else '捺',[(x,y),(ex,ey)],[w,thin])

    def dot(self,x,y,dx,dy,w=8):
        if self.hand=='mill':
            return self.bend('点',[(x,y),(x+dx,y+dy)],[w,w*.88])
        return self.add('点', P((x,y),(x+dx*.64+w*.40,y+dy*.22),
                               (x+dx+w*.3,y+dy*.72),(x+dx,y+dy),
                               (x+dx-w*.44,y+dy*.7)))

    def box(self,x,y,r,b,divisions=(),w=7):
        self.v(x,y,b+1,w)
        self.h(x,y,r,3 if self.hand!='mill' else 8)
        self.v(r,y,b,w)
        for mid in divisions:
            self.h(x,mid,r,3 if self.hand!='mill' else 7)
        self.h(x,b,r,3.7 if self.hand!='mill' else 8)


def industrial():
    letters={}
    def new(ch,w=1):
        g=Letter(ch,'mill',w);letters[ch]=g;return g

    g=new('终')
    g.bend('撇折',[(25,6),(8,37),(30,34)],[12.5,11,9])
    g.bend('撇折',[(32,26),(8,65),(34,59)],[11.2,11,9])
    g.bend('提',[(3,88),(35,75)],[13,11])
    g.slash(58,6,37,37,13,9)
    g.bend('横撇',[(52,18),(84,18),(67,40),(38,59)],[10,10,12,6])
    g.bend('捺',[(48,31),(68,46),(94,58)],[9,12,10])
    g.dot(50,59,23,11,10)
    g.dot(44,77,35,14,12)
    g=new('末')
    g.v(50,4,95,15.8)
    # A fabricated castellated beam, with punched triangular web openings.
    beam=P((6,19),(90,19),(96,23),(92,34),(6,34),(3,30))
    slots=[P((x,23),(x+12,23),(x+3,30)) for x in (13,29,60,76)]
    g.add('长横 · 穿孔桁梁',G.diff(beam,*slots),True)
    g.h(12,47,87,10)
    g.bend('撇',[(45,53),(29,72),(3,89)],[13.5,14,6.5])
    g.bend('捺',[(55,54),(71,73),(96,87)],[12.4,15,8])
    g=new('地')
    g.h(4,37,34,10);g.v(20,12,80,12.6)
    g.bend('提',[(2,86),(36,73)],[11.7,10])
    g.bend('竖弯钩',[(44,19),(44,84),(49,90),(88,90),(93,73)],[12.5,12.5,11,12,7])
    g.bend('横折钩',[(34,55),(85,28),(85,59),(74,62)],[9.5,10.8,11.3,7])
    g.v(63,4,77,12.5)
    g=new('明',.9)
    g.box(8,18,40,85,[50],10)
    g.bend('撇',[(57,10),(57,61),(55,82),(49,97)],[13,13,11,6])
    g.bend('横折钩',[(55,12),(89,12),(89,89),(78,90)],[9,10,12,9])
    g.h(57,39,89,8);g.h(57,64,89,8)
    g=new('日');g.box(15,11,85,88,[48],14)
    g=new('方');g.dot(41,6,12,12,12);g.h(5,29,95,10)
    g.bend('撇',[(45,30),(41,55),(31,77),(12,93)],[14,14,13,7])
    g.bend('横折钩',[(41,51),(79,51),(74,89),(60,89)],[10,11,13,9])
    g=new('舟',.9);g.slash(53,4,38,20,11,9)
    g.bend('撇',[(26,18),(25,66),(19,89),(14,96)],[13,13,9,4])
    g.bend('横折钩',[(24,20),(82,20),(82,89),(68,90)],[10,12,13,8])
    g.dot(44,32,13,12);g.h(4,58,97,9);g.dot(43,68,14,12)
    return letters


def celestial():
    letters={}
    def new(ch,w=1):
        g=Letter(ch,'graver',w);letters[ch]=g;return g
    g=new('星')
    g.box(22,9,78,44,[26],8.3)
    g.slash(23,52,7,77,8.7,.8)
    g.h(22,61,88,3.9);g.h(21,77,83);g.v(51,47,94,8.7);g.h(4,94,98,4.4)
    g=new('穹')
    g.ink('穴首点 · 极星指针',
          'M52 -4 Q54 9 63 12 Q56 14 52 24 Q50 15 41 13 Q50 9 52 -4Z',True)
    g.ink('左点','M15 18 Q17 29 10 38 L4 34 Q12 26 15 18Z')
    g.ink('横钩','M13 22 L82 21 L89 16 L98 24 L81 36 L85 25 L13 26Z')
    g.slash(37,29,13,49,7.8,1)
    g.ink('点','M58 28 Q80 32 87 43 L82 49 Q72 38 58 28Z')
    g.h(22,52,78);g.v(76,51,66,7.3);g.h(23,65,77)
    g.bend('竖折',[(25,64),(21,77),(80,77)],[7,7.5,3.4])
    g.ink('折钩','M76 75 L83 72 L88 77 Q84 96 74 100 L58 92 Q72 95 74 90 Q77 84 78 78Z')
    g=new('铁',.95)
    g.slash(23,4,4,35,8.8,.9);g.h(15,21,38);g.h(9,40,35);g.h(6,58,38)
    g.ink('竖提','M17 40 L26 41 L24 86 L40 77 L18 97 L13 92 L17 86Z')
    g.slash(55,15,41,45,9,.9)
    g.h(52,32,90,3.5);g.h(40,54,97,4)
    g.ink('撇','M66 4 L78 7 Q73 12 73 21 Q72 61 64 73 Q55 88 34 98 Q52 81 58 66 Q65 50 66 4Z')
    g.ink('捺','M69 54 Q77 76 101 88 L92 96 Q76 87 68 58Z')
    g=new('道',.91)
    g.dot(12,11,13,19,10);g.h(4,49,24)
    g.bend('横折折撇',[(22,48),(14,65),(24,65),(15,86)],[6.6,6,6.8,4.7])
    g.ink('平捺','M1 94 Q14 77 27 83 Q53 96 104 86 L97 97 Q57 103 30 90 Q16 81 6 98Z')
    g.dot(41,3,11,16,7.5);g.slash(78,3,64,22,8,.8);g.h(32,23,98)
    g.slash(61,25,51,37,7.1,3);g.box(41,38,86,79,[51,64],7.9)
    g=new('崩',.91)
    g.v(49,4,28,9);g.v(17,11,30,8);g.h(16,29,82,4);g.v(82,10,30,8)
    for x in (12,57):
        g.ink('撇',f'M{x} 40 L{x+9} 42 Q{x+9} 85 {x-6} 98 Q{x+2} 80 {x} 40Z')
        g.h(x+3,42,x+29);g.v(x+29,42,91,8);g.h(x+4,59,x+28);g.h(x+3,75,x+28)
        g.bend('钩',[(x+29,89),(x+27,95),(x+16,90)],[8,7,1])
    g=new('坏');g.v(22,12,79,9);g.h(4,38,39,4)
    g.bend('提',[(3,87),(39,72)],[7,1.5]);g.h(37,19,98,4)
    g.ink('撇','M66 21 L78 23 Q62 54 33 71 Q52 51 66 21Z');g.v(65,44,97,9)
    g.ink('点','M72 48 Q91 57 98 73 L92 80 Q85 63 72 48Z')
    return letters


def tidal():
    # Boundaries follow a loaded brush. Each horizontal has two unequal banks.
    m=Letter('鸣','tide')
    m.ink('竖','M3 26 Q9 28 13 32 Q11 49 9 73 L3 80 Q6 56 3 26Z')
    m.ink('横折','M6 30 Q18 32 26 27 L32 31 Q28 46 26 68 L18 74 Q23 51 23 33 L7 35Z')
    m.ink('横','M5 68 Q14 68 26 64 L25 69 Q12 70 6 74Z')
    m.ink('撇','M59 -2 Q62 3 70 5 Q64 13 46 22 Q55 11 59 -2Z')
    m.ink('横折钩','M40 20 Q68 19 81 12 L90 17 Q87 36 78 47 Q72 55 61 42 Q69 46 73 40 Q78 32 79 21 Q60 25 42 24Z')
    m.ink('点','M49 28 Q68 28 68 38 Q65 43 60 41 Q56 35 49 28Z')
    m.ink('竖折折钩','M35 17 L46 21 Q42 37 40 55 Q66 53 85 50 L94 47 L99 52 Q94 86 82 94 Q73 102 59 86 Q70 93 77 86 Q84 76 88 56 Q59 57 33 64 L29 60 Q36 38 35 17Z')
    # The bird's ground stroke becomes a standing wave; the wave is still a horizontal.
    m.ink('长横 · 驻波','M-4 87 C13 83 19 77 31 75 C46 72 57 81 73 65 C66 80 57 84 44 82 C25 78 18 91 -4 87Z',True)
    t=Letter('潮','tide')
    t.ink('点','M8 8 Q27 11 25 21 Q23 27 17 25 Q15 18 8 8Z')
    t.ink('点','M-1 37 Q18 37 19 48 Q16 53 11 51 Q7 43 -1 37Z')
    t.ink('提','M-2 75 Q8 82 24 51 Q21 65 14 88 Q13 96 8 95 Q4 93 -2 75Z')
    def water_h(x,y,e,w=4,kind='横'):
        t.ink(kind,f'M{x} {y} Q{x+(e-x)*.52} {y+1} {e} {y-4} L{e-1} {y+.8} Q{x+(e-x)*.52} {y+w*.75} {x+1} {y+w}Z')
    water_h(25,18,65)
    t.ink('竖','M43 4 L52 3 Q49 15 48 30 L41 32 Q44 17 43 4Z')
    t.ink('竖','M29 31 L36 32 Q34 49 33 63 L26 66 Q30 42 29 31Z')
    water_h(31,32,61,3.5)
    t.ink('折','M55 31 L61 27 L65 32 Q62 46 60 59 L52 64 Q57 44 55 31Z')
    water_h(30,46,58,3,kind='日部内横');water_h(28,61,59)
    water_h(19,78,65,4.2)
    t.ink('竖','M39 62 L48 60 Q43 79 45 93 L37 101 Q39 86 39 62Z')
    t.ink('撇','M71 17 L80 17 Q77 52 70 74 Q64 90 51 100 Q63 82 66 64 Q70 38 71 17Z')
    t.ink('横折钩','M73 16 Q91 14 98 9 L104 13 Q97 48 97 78 Q97 97 88 99 L76 86 Q85 91 87 83 Q89 51 94 17 L74 21Z')
    water_h(73,40,93,3.4);water_h(69,61,92,3.6)
    return {'鸣':m,'潮':t}


def fit(p,x,y,width,height):
    x0,y0,x1,y1=p.bounds
    return G.affine(p,width/(x1-x0),0,0,height/(y1-y0),x-width*x0/(x1-x0),y-height*y0/(y1-y0))


def letter_at(g,x,y,w,h,slant=0):
    # Work in the unskewed cell first, then move the outline and its highlighted stroke together.
    place=lambda p:G.affine(p,w/100,0,-slant*h/100,h/100,x+slant*h,y)
    return place(g.face()), place(g.accent) if g.accent is not None else None

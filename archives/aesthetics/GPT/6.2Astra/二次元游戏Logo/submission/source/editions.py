"""Compose the six physical plates and export vector artwork and registered PNG films."""
import io
import base64
import json
import math
import random
import re
import sys
import tempfile
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from fontTools.pens.recordingPen import DecomposingRecordingPen
from lettering import ROOT, Font, G, P, shape, industrial, celestial, tidal, fit, letter_at

sys.path.insert(0, str(Path(tempfile.gettempdir()) / 'formlab-vector-runtime'))
import resvg_py

FONTS = Path('C:/Windows/Fonts')
ASSETS = ROOT / 'assets'
ASSETS.mkdir(exist_ok=True)
WIDTH, HEIGHT = 1120, 480
LAYER_NAMES = ['底板', '背景英文', '主体元素', '中英文字面', '细线与刻度', '受光边与肌理']
LATIN = {}


class OutlineFont(Font):
    def outline(self, ch):
        if ch not in self._outlines:
            pen = DecomposingRecordingPen(self.gs)
            self.gs[self.gname(ch)].draw(pen)
            p = G.Path()
            pen.replay(p.getPen())
            self._outlines[ch] = G.simplify(G.scale(p, self.k))
        return G.Path(self._outlines[ch])


def path(p, fill, extra=''):
    d = p if isinstance(p,str) else G.to_svg_d(p)
    return f'<path d="{d}" fill="{fill}" {extra}/>'


def line(d, color, w=1, extra=''):
    return path(d,'none',f'stroke="{color}" stroke-width="{w}" {extra}')


def oval(x,y,rx,ry,angle,color,w=1,extra=''):
    return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" transform="rotate({angle} {x} {y})" fill="none" stroke="{color}" stroke-width="{w}" {extra}/>'


def circle(x,y,r,c):
    return f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r}" fill="{c}"/>'


def lettering(font, word, x, y, w, h, track=.12):
    if font not in LATIN:
        LATIN[font]=OutlineFont(FONTS/font)
    p,_=LATIN[font].line(word,tracking=track)
    return fit(G.scale(p,1,-1),x,y,w,h)


def grad(name,stops, y1=0,y2=1):
    ss=''.join(f'<stop offset="{v}%" stop-color="{c}"/>' for v,c in stops)
    return f'<linearGradient id="ID_{name}" x1="0" x2="0" y1="{y1*100}%" y2="{y2*100}%">{ss}</linearGradient>'


def column(gs,placements):
    faces=[];accent=None
    for ch,x,y,w,h,lean in placements:
        face,mark=letter_at(gs[ch],x,y,w,h,lean)
        faces.append(face)
        if mark is not None:
            accent=mark
    return G.union(faces),accent


def dark_outline(p,dx,dy,r):
    return G.move(G.offset(p,r,'bevel'),dx,dy)


def grain_defs(face):
    r=random.Random(34)
    s=''.join(circle(r.uniform(0,38),r.uniform(0,29),r.choice([.23,.34,.58]),'#101810') for _ in range(21))
    return '<pattern id="ID_grain" width="38" height="29" patternUnits="userSpaceOnUse">'+s+'</pattern>'+f'<clipPath id="ID_clip">{path(face,"#fff")}</clipPath>'


def metal_edge(face,light,edge,amount=.95):
    lit=G.diff(face,G.move(face,1.1*amount,1.7*amount))
    dark=G.diff(face,G.move(face,-.8*amount,-1.2*amount))
    return path(dark,edge)+path(lit,light)+path(face,'url(#ID_grain)','opacity=".38"')


def annotated_pieces(glyph):
    # An indexed proof gives each pixel to the last stroke actually visible there.
    strokes=[(kind,G.to_svg_d(p)) for kind,p in glyph.strokes]
    levels=[12*(i+1) for i in range(len(strokes))]
    drawing=''.join(path(d,f'#{v:02x}{v:02x}{v:02x}') for (_,d),v in zip(strokes,levels))
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="-10 -10 120 120">{drawing}</svg>'
    rgba=np.array(render(svg,480))
    pieces=[]
    for (kind,d),v in zip(strokes,levels):
        mask=(rgba[:,:,0]==v)&(rgba[:,:,3]==255)
        depth=cv2.distanceTransform(mask.astype(np.uint8),cv2.DIST_L2,5)
        rows,cols=np.nonzero(mask)
        x=(cols+.5)/4-10
        y=(rows+.5)/4-10
        score=np.minimum(depth[rows,cols]/4,4)*3-.08*np.hypot(x-x.mean(),y-y.mean())
        for _,_,px,py in pieces:
            score-=4*np.maximum(0,9-np.hypot(x-px,y-py))
        best=np.argmax(score)
        pieces.append([kind,d,round(x[best],2),round(y[best],2)])
    return pieces


def compare_info(chars,ch,reference):
    base=OutlineFont(FONTS/reference)
    atlas={}
    for letter,glyph in chars.items():
        atlas[letter]=dict(before=G.to_svg_d(fit(G.scale(base.outline(letter),1,-1),3,4,94,92)),
                           after=G.to_svg_d(glyph.face()),pieces=annotated_pieces(glyph))
    ref=fit(G.scale(base.outline(ch),1,-1),3,4,94,92)
    if ch=='鸣':
        base_stroke=G.pick(ref,2)
    else:
        window=G.rect(0,17.4,100,30.8) if ch=='末' else G.rect(39,3,64,17.4)
        base_stroke=G.inter(ref,window)
    other,kind={'末':('地','横'),'穹':('道','点'),'鸣':('潮','日部内横')}[ch]
    echo=next(p for k,p in chars[other].strokes if k==kind)
    return dict(char=ch,before=G.to_svg_d(ref),beforeAccent=G.to_svg_d(base_stroke),
                after=G.to_svg_d(chars[ch].face()),accent=G.to_svg_d(chars[ch].accent),
                echoChar=other,echo=G.to_svg_d(chars[other].face()),echoAccent=G.to_svg_d(echo),
                atlas=atlas)


def endfield_plate():
    chars=industrial()
    main,accent=column(chars,[('终',53,133,327,224,.055),('末',382,125,326,233,.055),('地',707,120,344,240,.055)])
    series,_=column(chars,[(ch,93+i*43,80,36,33,.055) for i,ch in enumerate('明日方舟')])
    face=G.union(main,series)
    # Folded sheet follows the outer stroke footprint. Empty corners are die-cut.
    sheet=shape('M37 298 L56 185 L100 140 L87 123 L96 67 L259 67 L279 80 L544 80 L557 99 L687 99 L717 118 L991 112 L1031 129 L1060 191 L1056 303 L1081 319 L1061 367 L1035 367 L1022 402 L639 402 L620 413 L275 413 L258 401 L64 401 L77 359 L31 357Z')
    sheet=G.union(sheet,dark_outline(face,0,3,8))
    # Tiny breaks in the ridge belong to the punching die.
    sheet=G.diff(sheet,P((109,69),(123,67),(114,76),(105,77)),
                 P((688,397),(706,395),(697,406),(680,407)))
    defs=grad('board',[(0,'#353a34'),(45,'#222622'),(100,'#191c1a')])+grad('face',[(0,'#fffceb'),(36,'#f4f1df'),(58,'#d6d9c9'),(59,'#f8f5e9'),(100,'#cbd0bf')])+grain_defs(face)
    board=path(sheet,'url(#ID_board)')+line('M70 391H250L264 402H433M1029 154L1046 176V218','#75796b',1.7)
    ghost=path(lettering('BarlowCondensed-SemiBold.ttf','ENDFIELD',309,93,485,129,.035),'#414638')
    # A gantry lifting head. Two parallel chords, diagonals and the hanging hook.
    crane=line('M697 123L793 52H1014L1033 64H818L743 129 M794 52L831 23L929 59 M825 53L840 17L846 52','#d8b44d',3.2)
    crane+=path('M790 52L1020 52L1037 62L1029 67L802 67Z','#e2c342')
    crane+=line('M805 60L815 54L827 63L841 54L854 63L869 54L881 63L896 54L910 63L924 54L937 63L951 54L963 63L977 54L989 63L1003 54L1016 63','#64603d',4.5)
    crane+=path('M788 66H814V126H804V86L789 106H778Z','#b9b99e')+line('M1001 67V95Q1002 104 1010 100L1012 94','#e4d894',2.7)
    crane+=path('M777 55L795 43H819V58H790V75H777Z','#efcb41')+line('M814 69L792 121M818 71V118','#787c66',2)
    en=lettering('BarlowCondensed-SemiBold.ttf','ARKNIGHTS: ENDFIELD',239,368,677,24,.29)
    top_en=lettering('BarlowCondensed-Medium.ttf','ARKNIGHTS',298,78,143,16,.17)
    letters=path(dark_outline(face,3.7,4.5,2.1),'#10140f')+path(face,'url(#ID_face)')+path(accent,'#ffda39')+path(en,'#dedecb','class="latin-face"')+path(top_en,'#d4d3bf','class="latin-face"')
    lines=line('M84 380H213M939 381H1022M268 94V80M461 87H529L547 105H623','#a9ae97',2)
    lines+=''.join(path(P((84+i*16,369),(96+i*16,369),(88+i*16,379),(76+i*16,379)),'#e1c447') for i in range(6))
    lines+=''.join(path(G.rect(947+i*9,372,949+i*9,377 if i%3 else 381),'#c4c7ac') for i in range(9))
    for x,y in [(111,77),(285,397),(1022,356)]:
        lines+=circle(x,y,2.4,'#c5c5af')+line(f'M{x-1.4} {y+1}l2.8 -2','#444a3d',.8)
    highlights=metal_edge(face,'#ffffe6','#8f9587',1.35)
    for y in (194,221,278,326):
        highlights+=line(f'M65 {y}h320m90 1h193m62 -1h292','#6c715b',.47,'opacity=".45" clip-path="url(#ID_clip)"')
    return '终末地','endfield',defs,[board,ghost,crane,letters,lines,highlights],compare_info(chars,'末','SourceHanSansCN-Heavy.otf')


def star_plate():
    chars=celestial()
    main,accent=column(chars,[('星',34,130,254,230,.065),('穹',293,101,263,252,.065),
                              ('铁',552,135,238,226,.065),('道',792,108,252,245,.065)])
    series,_=column(chars,[(c,75+i*47,78,42,37,.065) for i,c in enumerate('崩坏')])
    face=G.union(main,series)
    sweep=shape('M11 330Q80 302 102 258Q162 190 324 175Q603 134 1087 119Q1015 144 982 183Q1052 158 1098 160Q1042 193 1003 251Q849 343 937 360Q837 370 837 397Q376 383 156 416Q249 373 136 370L36 384Q88 348 11 358Z')
    sheet=G.union(sweep,dark_outline(main,0,3,6.5),dark_outline(series,0,0,5))
    sheet=G.union(sheet,shape('M65 124L76 71L165 77Q216 86 286 78L268 111Q172 100 120 120Z'))
    defs=grad('night',[(0,'#24243b'),(100,'#1d1b31')])+grad('face',[(0,'#fff8dc'),(27,'#fffefa'),(66,'#e6e1ee'),(100,'#c7bdd5')])+grad('brass',[(0,'#f4d79c'),(47,'#afa084'),(87,'#ddbc8b'),(100,'#978b8e')])+grain_defs(face)
    board=path(sheet,'url(#ID_night)')+path('M117 400Q449 346 873 373Q373 350 117 400Z','#3a3346')
    ghost=path(G.inter(lettering('times.ttf','S',206,67,203,276,0),sheet),'#393549')
    # An astronomical instrument, mounted at an angle with its meridian and horizon circles.
    ast=oval(429,183,208,129,-21,'url(#ID_brass)',5)+oval(429,183,215,134,-21,'#ad9477',1.55)
    ast+=oval(429,183,199,50,-37,'#bfa98d',2.8)+oval(429,183,66,130,34,'#b5a18b',1.8)
    ast+=line('M276 309L565 52M421 53L443 306','#ada392',1.1)
    for i in range(100):
        a=2*math.pi*i/100
        pt=lambda rx,ry:(429+rx*math.cos(a)*.934 + ry*math.sin(a)*.358,183-rx*math.cos(a)*.358+ry*math.sin(a)*.934)
        x,y=pt(210,131);u,v=pt(206 if i%5 else 201,127 if i%5 else 123)
        ast+=line(f'M{x:.2f} {y:.2f}L{u:.2f} {v:.2f}','#e7c79b',1.1 if i%5 else 1.7)
    ast+=circle(564.7,52.5,7,'#b9986e')+circle(564.7,52.5,3,'#f4d6a0')
    en=lettering('times.ttf','HONKAI: STAR RAIL',217,367,625,24,.29)
    en2=lettering('times.ttf','HONKAI',171,87,102,13,.14)
    letters=path(dark_outline(face,1.8,3.5,2.8),'#201b32')+path(face,'url(#ID_face)')+path(accent,'#f8d28d')+path(en,'#e4d3b1','class="latin-face"')+path(en2,'#c7bba7','class="latin-face"')
    lines=line('M43 385L192 378M862 378L1059 359M303 412Q526 378 733 399','#bea280',1.8)
    for x,y,r in [(188,378,6),(866,378,5),(1059,359,3),(634,79,6),(660,65,2.1)]:
        lines+=path(P((x,y-r*1.4),(x+r*.23,y-r*.23),(x+r,y),(x+r*.2,y+r*.23),(x,y+r*1.4),(x-r*.23,y+r*.22),(x-r,y),(x-r*.22,y-r*.23)),'#dec196')
    highlights=metal_edge(face,'#fff8de','#a090a5',.89)
    # A second cut on the thick stems gives the letters an engraved spine.
    for x,y,end in [(168,243,337),(734,151,215),(907,212,283),(353,232,266)]:
        highlights+=line(f'M{x} {y}l-4 {end-y}','#9d96b2',1.5,'clip-path="url(#ID_clip)"')
    return '星穹铁道','starrail',defs,[board,ghost,ast,letters,lines,highlights],compare_info(chars,'穹','SourceHanSerifCN-SemiBold.otf')


def wave_plate():
    chars=tidal()
    main,accent=column(chars,[('鸣',100,84,417,274,.045),('潮',524,75,420,286,.045)])
    face=main
    sheet=shape('M18 330C127 286 174 226 282 194C485 106 740 112 1006 83C939 108 909 127 864 147L1061 117Q978 157 914 210Q893 247 1045 220Q955 248 901 290Q848 331 1027 309Q869 351 827 385Q487 376 199 426Q274 388 289 369Q146 385 60 392Q129 365 151 342Z')
    sheet=G.union(sheet,dark_outline(face,1,2,5))
    sheet=G.union(sheet,shape('M172 412Q226 386 200 364Q510 339 915 349Q856 373 845 407Q531 398 172 412Z'))
    defs=grad('deep',[(0,'#12393d'),(63,'#113535'),(100,'#0a272c')])+grad('face',[(0,'#e5f6ed'),(24,'#f1fff5'),(52,'#c7e7dd'),(55,'#f2fff6'),(100,'#a1d1c7')])+grad('fork',[(0,'#a2d4c6'),(46,'#769e99'),(80,'#538786'),(100,'#aad6ca')])+grain_defs(face)
    board=path(sheet,'url(#ID_deep)')
    # Long dry-brush filaments grow out of the backing's lower lip.
    board+=path('M34 379Q180 332 341 321Q176 343 34 379ZM187 431Q409 378 617 388Q387 390 187 431Z','#164044')
    ghost=path(G.inter(lettering('georgiai.ttf','W',143,72,350,250,0),sheet),'#285453')
    fork='<g transform="rotate(23 818 201)">'+path('M775 31Q777 23 784 24Q790 25 790 33V133Q790 158 806 158Q824 158 824 134V32Q824 25 831 25Q837 25 837 32V136Q837 166 813 175L813 244Q813 253 806 253Q798 253 798 245V175Q775 168 775 137Z','url(#ID_fork)')+line('M779 33V129Q778 151 789 159M828 34V127','#d9f9e8',2.1)+'</g>'
    fork+=line('M841 47Q873 29 884 47M844 37Q877 15 896 39M895 73Q919 75 923 95','#99c5bc',1.2)
    en=lettering('CormorantGaramond-SemiBold.ttf','WUTHERING WAVES',235,369,607,32,.16)
    letters=path(dark_outline(face,2.5,3.5,2.6),'#0b3032')+path(face,'url(#ID_face)')+path(accent,'#83e0c8')+path(en,'#d9eae0','class="latin-face"')
    lines=line('M46 389Q111 378 150 381T220 380M855 378Q904 380 932 359T1031 326','#a6c9bb',2.1)
    lines+=line('M316 422Q430 396 500 411T662 406Q704 401 724 406','#719e92',1.3)
    for x,y,r in [(193,382,2.8),(855,378,3.1),(1029,326,3.5),(1039,321,1.7)]:
        lines+=circle(x,y,r,'#b0ded0')
    highlights=metal_edge(face,'#effff5','#79a09b',.85)
    # Translucent tide lines are trimmed at the brush's actual boundary.
    for i in range(9):
        y=190+i*13
        highlights+=line(f'M70 {y}C235 {y+50} 318 {y-68} 461 {y-16}S715 {y+9} 966 {y-37}','#6eb5a5',.65,'opacity=".51" clip-path="url(#ID_clip)"')
    return '鸣潮','waves',defs,[board,ghost,fork,letters,lines,highlights],compare_info(chars,'鸣','simkai.ttf')


def xml(defs,groups):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}"><defs>{defs}</defs>{"".join(groups)}</svg>'


def render(svg,w=4480):
    raw=resvg_py.svg_to_bytes(svg_string=svg,width=w,skip_system_fonts=True)
    return Image.open(io.BytesIO(raw)).convert('RGBA')


def proof_film(index,markup,image,defs):
    if index==2:
        # Preserve the dark web of the crane and the change of plane on the tuning fork.
        gray=image.convert('L').point(lambda v: round(34+.69*v)).convert('RGBA')
        gray.putalpha(image.getchannel('A'))
        return gray
    if index==3:
        def tone(match):
            fill=match[1]
            if fill.startswith('url('):
                return 'fill="#F1F1F1"'
            light=sum(int(fill[i:i+2],16) for i in (1,3,5))/3
            return 'fill="#F1F1F1"' if light>125 else 'fill="#171717"'
        return render(xml(defs,[re.sub(r'fill="([^"]+)"',tone,markup)]))
    neutral=[25,49,146,240,168,0][index]
    plate=Image.new('RGBA',image.size,(neutral,neutral,neutral,0))
    if index<5:
        plate.putalpha(image.getchannel('A'))
    return plate


def package_downloads(key,out):
    folder=ASSETS/'downloads'
    folder.mkdir(exist_ok=True)
    images={f:base64.b64encode((out/f).read_bytes()).decode('ascii') for f in ('final.png','mono.png')}
    payload='window.LabPrints ||= {};\nwindow.LabPrints['+json.dumps(key)+']='+json.dumps(images,separators=(',',':'))+';\n'
    (folder/(key+'.js')).write_text(payload,encoding='ascii')


def publish():
    archive={}
    for fn in (endfield_plate,star_plate,wave_plate):
        name,key,defs,layers,compare=fn()
        out=ROOT/'logos'/name
        (out/'layers').mkdir(parents=True,exist_ok=True)
        final=Image.new('RGBA',(4480,1920))
        mono=Image.new('RGBA',final.size)
        for i,(label,data) in enumerate(zip(LAYER_NAMES,layers)):
            image=render(xml(defs,[data]))
            assert image.size==final.size
            image.save(out/'layers'/f'{i+1:02d}_{label}.png',compress_level=7)
            final.alpha_composite(image)
            mono.alpha_composite(proof_film(i,data,image,defs))
        final.save(out/'final.png',compress_level=8)
        mono.save(out/'mono.png',compress_level=8)
        package_downloads(key,out)
        proof_dir=ASSETS/'proofs'
        proof_dir.mkdir(exist_ok=True)
        proof_size=(round(final.width*64/final.height),64)
        final.resize(proof_size,Image.Resampling.LANCZOS).save(proof_dir/f'{key}-64.png')
        chinese_svg=xml(defs,[layers[3],layers[5]])
        chinese_svg=chinese_svg.replace('<defs>','<style>.latin-face { display: none }</style><defs>',1)
        chinese=render(chinese_svg)
        chinese.resize(proof_size,Image.Resampling.LANCZOS).save(proof_dir/f'{key}-chinese-64.png')
        # The same registered films are referenced by the gallery, the microscope and the export timeline.
        archive[key]=dict(defs=defs,layers=layers,compare=compare)
        print(name,final.getbbox(),flush=True)
    (ASSETS/'editions.js').write_text('window.EDITIONS='+json.dumps(archive,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')


if __name__=='__main__':
    publish()

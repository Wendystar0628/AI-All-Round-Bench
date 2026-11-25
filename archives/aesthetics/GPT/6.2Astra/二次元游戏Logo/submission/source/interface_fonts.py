"""Package only the text used by this offline exhibition."""
import sys
import tempfile
from pathlib import Path
sys.path.insert(0,str(Path(tempfile.gettempdir())/'formlab-vector-runtime'))
from fontTools import subset
from fontTools.ttLib import TTFont

root=Path(__file__).resolve().parents[1]
dest=root/'assets'/'fonts'
dest.mkdir(exist_ok=True)
copy=(root/'index.html').read_text('utf-8')
for filename in ('catalog.js','gallery.js','film.js','site.css'):
    copy+=(root/'assets'/filename).read_text('utf-8')
copy+=''.join(map(chr,range(32,127)))
licenses=[]
for original,file,family,style in [
    ('SourceHanSansCN-Regular.otf','sans','Form Lab Sans','Regular'),
    ('SourceHanSansCN-Heavy.otf','heavy','Form Lab Sans','Heavy'),
    ('IBMPlexMono-Regular.ttf','mono','Form Lab Mono','Regular')]:
    font=TTFont(Path('C:/Windows/Fonts')/original)
    info=font['name']
    licenses.append(original+'\n'+'\n'.join(filter(None,[info.getDebugName(i) for i in (0,13,14)])))
    opts=subset.Options()
    opts.flavor='woff2'
    opts.layout_features=['kern','liga','locl']
    sub=subset.Subsetter(options=opts)
    sub.populate(text=copy if file!='mono' else ''.join(chr(i) for i in range(32,128))+'–—×·→←↗')
    sub.subset(font)
    renamed={1:family,2:style,3:family+' '+style+' Subset 1',4:family+' '+style,
             6:(family+'-'+style).replace(' ',''),16:family,17:style}
    for record in font['name'].names:
        if record.nameID in renamed:
            record.string=renamed[record.nameID].encode(record.getEncoding())
    font.flavor='woff2'
    font.save(dest/(file+'.woff2'))
    print(file,(dest/(file+'.woff2')).stat().st_size)
(dest/'NOTICE.txt').write_text('\n\n'.join(licenses),encoding='utf-8')

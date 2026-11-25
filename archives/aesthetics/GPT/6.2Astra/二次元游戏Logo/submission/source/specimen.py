"""Draw the little exploded axonometric printing plate in the catalogue masthead."""
from lettering import ROOT, industrial, G

def render():
    face=G.to_svg_d(industrial()['末'].face())
    parts=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 346 164" fill="none">',
        '<defs><pattern id="dots" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".57" fill="#b6b6aa"/></pattern></defs>',
        '<rect x="0" y="6" width="346" height="150" fill="url(#dots)"/>',
        '<g stroke="#a6a89b" stroke-width=".7" stroke-dasharray="3 4"><path d="M83 101V49M182 137V69M245 100V45M145 64V11"/></g>']
    for n,(y,facecolor,plate) in enumerate([(91,'#3c4037','#d7d8cb'),(72,'#777e70','#e7e7db'),(50,'#24281f','#edcf54')]):
        parts.append(f'<g transform="matrix(.92 .30 -.62 .39 143 {y-37})">')
        parts.append(f'<path d="M0 0H108V105H0Z" fill="{plate}" stroke="#44493f" stroke-width="1.3"/>')
        if n!=2:
            for i in range(10,109,12):
                parts.append(f'<path d="M{i} 1V105M1 {i}H107" stroke="#9a9d8f" stroke-width=".55"/>')
        parts.append(f'<path d="{face}" transform="translate(7 5) scale(.93)" fill="{facecolor}"/>')
        for x,y0 in [(5,5),(101,5),(5,99),(101,99)]:
            parts.append(f'<circle cx="{x}" cy="{y0}" r="1.8" stroke="#44493f" stroke-width=".7"/>')
        parts.append('</g>')
    parts.extend(['<g stroke="#6e7467" stroke-width=".8"><path d="M221 46L243 25H279M91 95L66 115H34M84 122L177 153M81 125l6-7m87 39l6-7"/></g>',
        '<g fill="#454a3f" font-family="monospace" font-size="7.5" letter-spacing="1.1"><text x="248" y="20">FACE</text><text x="32" y="109">BASE</text><text x="236" y="135">FIG. A</text></g>',
        '<path d="M17 12h8m-4-4v8m290 123h8m-4-4v8" stroke="#767c70" stroke-width="1"/>','</svg>'])
    (ROOT/'assets'/'specimen.svg').write_text(''.join(parts),encoding='utf-8')

if __name__=='__main__':render()

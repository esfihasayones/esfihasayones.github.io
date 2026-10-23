#!/usr/bin/env python3
"""Gera os <symbol> das esfihas, vistas de cima (como a foto de referência).

A versão anterior era de três-quartos, com a lateral da massa à mostra, e os
clientes leram como tigela ("a de carne parece um pote com feijão"). De cima,
com borda estufada e recheio em pedaços, lê como esfiha aberta.

Uso: python3 ops/desenhos/gerar_esfihas.py > /tmp/simbolos.svg
Cada sabor usa uma semente fixa, então rodar de novo dá o mesmo desenho.
"""
import math
import random

C = 50.0          # centro
R_MASSA = 45.0    # raio da borda de massa
R_RECHEIO = 35.5  # raio do recheio


def f(x):
    return f"{x:.1f}".rstrip("0").rstrip(".")


def bolha(rnd, cx, cy, r, pontas=7, irregular=0.35, rot=None, achatar=1.0):
    """Contorno irregular fechado, suavizado com Catmull-Rom."""
    rot = rnd.uniform(0, math.tau) if rot is None else rot
    pts = []
    for i in range(pontas):
        a = rot + i * math.tau / pontas
        rr = r * (1 + rnd.uniform(-irregular, irregular))
        x = rr * math.cos(a)
        y = rr * math.sin(a) * achatar
        # gira o achatamento junto
        xr = x * math.cos(rot) - y * math.sin(rot)
        yr = x * math.sin(rot) + y * math.cos(rot)
        pts.append((cx + xr, cy + yr))
    n = len(pts)
    d = f"M{f(pts[0][0])} {f(pts[0][1])}"
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
    return d + "Z"


def ponto_no_recheio(rnd, margem=2.5):
    r = (R_RECHEIO - margem) * math.sqrt(rnd.random())
    a = rnd.uniform(0, math.tau)
    return C + r * math.cos(a), C + r * math.sin(a)


def massa(rnd, pre):
    """Sombra, borda estufada, manchas de forno e a cavidade do recheio."""
    out = [
        f'<circle cx="50" cy="52.5" r="47.5" fill="url(#{pre}-sombra)"/>',
        f'<path d="{bolha(rnd, C, C, R_MASSA, pontas=14, irregular=0.025)}" fill="url(#{pre}-massa)"/>',
    ]
    # manchas douradas de forno na borda
    for _ in range(16):
        a = rnd.uniform(0, math.tau)
        rr = rnd.uniform(R_RECHEIO + 2.5, R_MASSA - 2)
        x, y = C + rr * math.cos(a), C + rr * math.sin(a)
        cor = rnd.choice(["#C98A3E", "#B8772F", "#D99B4E"])
        out.append(f'<path d="{bolha(rnd, x, y, rnd.uniform(1.2, 2.6), pontas=5, irregular=.4, achatar=.6)}" '
                   f'fill="{cor}" opacity="{f(rnd.uniform(.25, .5))}"/>')
    # brilho da borda, em cima à esquerda
    out.append('<path d="M17 33A38 38 0 0 1 40 11" fill="none" stroke="#FCE7BC" stroke-width="3" '
               'stroke-linecap="round" opacity=".7"/>')
    # sombra interna: o recheio fica mais baixo que a borda
    out.append(f'<circle cx="50" cy="50.8" r="{f(R_RECHEIO + 1.8)}" fill="#A86D2C" opacity=".55"/>')
    return out


def relevo(pre, freq, escala, sem):
    """Ruído iluminado multiplicado sobre o recheio: dá volume de pedacinhos."""
    return (
        f'<filter id="{pre}-relevo" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="2" seed="{sem}" result="r"/>'
        f'<feDiffuseLighting in="r" surfaceScale="{escala}" lighting-color="#fff" result="l">'
        '<feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting>'
        '<feComposite in="l" in2="SourceGraphic" operator="arithmetic" k1="1.5" k2="0" k3="0" k4="0" result="m"/>'
        '<feComposite in="m" in2="SourceAlpha" operator="in"/></filter>'
    )


def sombra_grumo(pre):
    return (f'<filter id="{pre}-grumo" x="-5%" y="-5%" width="110%" height="110%">'
            '<feDropShadow dx=".35" dy=".45" stdDeviation=".3" flood-color="#4A1408" flood-opacity=".55"/></filter>')


def gradientes(pre):
    return (
        f'<radialGradient id="{pre}-sombra" cx=".5" cy=".5" r=".5">'
        '<stop offset=".82" stop-color="#2E211A" stop-opacity=".2"/>'
        '<stop offset="1" stop-color="#2E211A" stop-opacity="0"/></radialGradient>'
        f'<radialGradient id="{pre}-massa" cx=".42" cy=".38" r=".62">'
        '<stop offset=".55" stop-color="#F3CC86"/><stop offset=".85" stop-color="#E4AE5E"/>'
        '<stop offset="1" stop-color="#C98B3F"/></radialGradient>'
        f'<radialGradient id="{pre}-cupula" cx=".42" cy=".4" r=".6">'
        '<stop offset=".5" stop-color="#fff" stop-opacity="0"/>'
        '<stop offset="1" stop-color="#3A1E10" stop-opacity=".35"/></radialGradient>'
    )


def base(rnd, cor):
    return f'<path d="{bolha(rnd, C, C + .4, R_RECHEIO, pontas=16, irregular=.035)}" fill="{cor}"/>'


def pedacos(rnd, n, cores, r=(1.6, 3.2), achatar=(0.6, 1.0), margem=2.5, opac=None):
    out = []
    for _ in range(n):
        x, y = ponto_no_recheio(rnd, margem)
        d = bolha(rnd, x, y, rnd.uniform(*r), pontas=rnd.choice([5, 6, 7]), irregular=.4,
                  achatar=rnd.uniform(*achatar))
        o = f' opacity="{f(rnd.uniform(*opac))}"' if opac else ""
        out.append(f'<path d="{d}" fill="{rnd.choice(cores)}"{o}/>')
    return out


def brilhos(rnd, n, r=(.5, 1.0)):
    out = []
    for _ in range(n):
        x, y = ponto_no_recheio(rnd, 4)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rnd.uniform(*r))}" ry="{f(rnd.uniform(*r) * .6)}" '
                   f'fill="#fff" opacity="{f(rnd.uniform(.35, .6))}"/>')
    return out


def recheio(pre, partes):
    """Junta o recheio num grupo com relevo e escurece a borda (cúpula)."""
    return ([f'<g filter="url(#{pre}-relevo)">'] + partes + ['</g>',
            f'<circle cx="50" cy="50.4" r="{f(R_RECHEIO)}" fill="url(#{pre}-cupula)"/>'])


def mucarela(rnd, x, y, r, cor="#FFF3D3"):
    """Mancha de muçarela derretida: borda translúcida, miolo cheio e um dourado."""
    rot = rnd.uniform(0, math.tau)
    out = [f'<path d="{bolha(rnd, x, y, r * 1.18, pontas=9, irregular=.22, rot=rot, achatar=.85)}" '
           f'fill="{cor}" opacity=".55"/>',
           f'<path d="{bolha(rnd, x, y, r, pontas=9, irregular=.2, rot=rot, achatar=.85)}" fill="{cor}"/>']
    if rnd.random() < .7:
        out.append(f'<path d="{bolha(rnd, x + rnd.uniform(-r, r) * .35, y + rnd.uniform(-r, r) * .35, r * .32, pontas=6, irregular=.35)}" '
                   f'fill="#E9B866" opacity=".55"/>')
    return out


def calabresa():
    rnd = random.Random(11)
    pre = "cal"
    out = massa(rnd, pre)
    # fundo: molho de tomate com muçarela derretida aparecendo entre os grumos
    r = [base(rnd, "#C8562F")]
    r += pedacos(rnd, 16, ["#F8EBCB", "#F3DEB2"], r=(2.8, 4.8), achatar=(.6, .9), margem=5, opac=(.6, .8))
    out += recheio(pre, r)
    # calabresa moída: farelos angulosos, laranja-avermelhados, com uma sombra só pro grupo
    pts = sorted((ponto_no_recheio(rnd, 2.5) for _ in range(230)), key=lambda p: p[1])
    out.append(f'<g filter="url(#{pre}-grumo)">')
    for (x, y) in pts:
        cor = rnd.choice(["#C9532F", "#D8653D", "#BF4A2C", "#E07650", "#B5422A", "#D05A36"])
        out.append(f'<path d="{bolha(rnd, x, y, rnd.uniform(1.1, 2.1), pontas=5, irregular=.45, achatar=rnd.uniform(.6, 1))}" '
                   f'fill="{cor}"/>')
    out.append('</g>')
    # gordura da linguiça e brilho do óleo
    for _ in range(30):
        x, y = ponto_no_recheio(rnd, 4)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(.25, .45))}" fill="#F6D3BC" opacity=".75"/>')
    out += brilhos(rnd, 24, r=(.35, .8))
    return pre, out


def carne():
    rnd = random.Random(23)
    pre = "car"
    out = massa(rnd, pre)
    r = [base(rnd, "#6E3B22")]
    r += pedacos(rnd, 120, ["#7E4629", "#5E321C", "#91573A", "#6A3820", "#84492B"], r=(1.3, 2.5))
    r += pedacos(rnd, 60, ["#A0663F", "#8A5232", "#B07248"], r=(.7, 1.3))
    r += pedacos(rnd, 14, ["#C8432B", "#D85A3C"], r=(1.0, 1.7), achatar=(.8, 1))  # tomate
    out += recheio(pre, r)
    out += brilhos(rnd, 16)
    return pre, out


def queijo():
    rnd = random.Random(37)
    pre = "que"
    out = massa(rnd, pre)
    r = [base(rnd, "#F4DDA2")]
    r += pedacos(rnd, 14, ["#FFF6DE", "#FDEBC0", "#FFF0CC"], r=(4, 7), achatar=(.6, .9), margem=5)
    r += pedacos(rnd, 12, ["#E7B25F", "#DDA04D"], r=(1.4, 3), achatar=(.5, .8), margem=4,
                 opac=(.45, .75))  # dourado do forno
    out += recheio(pre, r)
    for _ in range(38):  # orégano
        x, y = ponto_no_recheio(rnd, 3)
        out.append(f'<path d="{bolha(rnd, x, y, rnd.uniform(.45, .85), pontas=4, irregular=.4, achatar=.6)}" '
                   f'fill="{rnd.choice(["#5E6B2E", "#6F7A36", "#4C5826"])}"/>')
    out += brilhos(rnd, 12, r=(.7, 1.4))
    return pre, out


def marguerita():
    rnd = random.Random(53)
    pre = "mar"
    out = massa(rnd, pre)
    r = [base(rnd, "#B9432A")]
    # muçarela derretida cobrindo boa parte do molho
    for (x, y, rr) in [(36, 35, 10), (64, 34, 9.5), (33, 63, 9.5), (66, 64, 9.5), (50, 50, 9)]:
        r += mucarela(rnd, x, y, rr)
    out += recheio(pre, r)
    # rodelas de tomate, um pouco irregulares, com miolo e sementes
    for (x, y, rr) in [(50, 30, 7), (31, 50, 6.8), (52, 67, 7), (69, 48, 6.6)]:
        rot = rnd.uniform(0, math.tau)
        out.append(f'<path d="{bolha(rnd, x, y + .9, rr, pontas=8, irregular=.06, rot=rot)}" fill="#5E1E12" opacity=".3"/>')
        out.append(f'<path d="{bolha(rnd, x, y, rr, pontas=8, irregular=.06, rot=rot)}" fill="#C8352A"/>')
        out.append(f'<path d="{bolha(rnd, x, y, rr * .78, pontas=8, irregular=.08, rot=rot)}" fill="#E0503F"/>')
        for k in range(4):
            ang = rot + k * math.tau / 4
            sx, sy = x + rr * .42 * math.cos(ang), y + rr * .42 * math.sin(ang)
            out.append(f'<path d="{bolha(rnd, sx, sy, rr * .2, pontas=5, irregular=.25)}" fill="#F08A63"/>')
        out.append(f'<ellipse cx="{f(x - rr * .3)}" cy="{f(y - rr * .45)}" rx="{f(rr * .3)}" ry="{f(rr * .12)}" '
                   f'fill="#fff" opacity=".35" transform="rotate(-25 {f(x - rr * .3)} {f(y - rr * .45)})"/>')
    # manjericão: três folhas grandes, uma levemente dobrada
    for (x, y, ang, t) in [(41, 40, -35, 1.25), (61, 59, 145, 1.25), (59, 41, 50, 1.1)]:
        out.append(f'<g transform="translate({x} {y}) rotate({ang}) scale({t})">'
                   '<path d="M-6 1C-3.5-3.6 3.5-4 6.2 .4C3.6 4.4-3.6 4.6-6 1Z" fill="#1E3A18" opacity=".3"/>'
                   '<path d="M-6 0C-3.5-4.2 3.5-4.6 6.2-.4C3.6 3.6-3.6 3.8-6 0Z" fill="#2F6B2A"/>'
                   '<path d="M-6 0C-3.5-4.2 3.5-4.6 6.2-.4C2-1.2-2-.6-6 0Z" fill="#3F8A37"/>'
                   '<path d="M-5.2 0Q0-.9 5.6-.4" fill="none" stroke="#24521F" stroke-width=".5"/>'
                   '</g>')
    out += brilhos(rnd, 10)
    return pre, out


RELEVO = {"cal": (".25", .8, 3), "car": (".45", 1.9, 5), "que": (".11", 1.0, 7), "mar": (".14", .9, 9)}


def main():
    sabores = (calabresa, carne, queijo, marguerita)
    print('<svg xmlns="http://www.w3.org/2000/svg"><defs>')
    for fn in sabores:
        pre, _ = fn()
        print(gradientes(pre) + relevo(pre, *RELEVO[pre]) + (sombra_grumo(pre) if pre == "cal" else ""))
    for fn in sabores:
        pre, partes = fn()
        print(f'    <symbol id="ic-{fn.__name__}" viewBox="0 0 100 100">')
        for p in partes:
            print("      " + p)
        print("    </symbol>")
    print("</defs></svg>")


if __name__ == "__main__":
    main()

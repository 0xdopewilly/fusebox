"""Draws the ₮ in USD₮0 for the site's own fonts, none of which has the glyph.

Geist, Geist Mono and Archivo stop at the Latin currency signs, so a browser would borrow ₮ (U+20AE) from a system font
that doesn't match. This takes each font's own "T" and adds the two slanted strokes of the ₮, at that font's stem
weight, then writes a one-glyph font. CSS loads it first with unicode-range: U+20AE, so it only ever draws that sign.

  python web/scripts/build-tugrik.py        (needs fonttools and brotli; .tools/fontvenv has them)

Writes web/public/fonts/tug-*.woff2 for the site and web/assets/og/tug-*.ttf for the share cards.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
SRC = {
    "sans-400": (ROOT / "deweb/src/fonts/geist.woff2", {"wght": 400}),
    "sans-600": (ROOT / "deweb/src/fonts/geist.woff2", {"wght": 600}),
    "mono-500": (ROOT / "deweb/src/fonts/geist-mono-500.woff2", None),
    "mono-650": (ROOT / "deweb/src/fonts/geist-mono-650.woff2", None),
    "display-800": (ROOT / "deweb/src/fonts/archivo-800.woff2", None),
}


def signed_area(points):
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(points, points[1:] + points[:1])) / 2


def build(key, path, loc):
    font = TTFont(path)
    if loc and "fvar" in font:
        font = instancer.instantiateVariableFont(font, loc)
    gs = font.getGlyphSet()
    tname = font.getBestCmap()[ord("T")]
    t = gs[tname]
    bp = BoundsPen(gs); t.draw(bp)
    x0, y0, x1, y1 = bp.bounds
    rec = RecordingPen(); t.draw(rec)
    # the stem: the narrowest run of points at the baseline; the outline's direction, to draw the strokes the same way
    pts, contours, cur = [], [], []
    for op, args in rec.value:
        if op == "moveTo": cur = [args[0]]
        elif op in ("lineTo", "qCurveTo", "curveTo"): cur.extend(args)
        elif op in ("closePath", "endPath"): contours.append(cur); cur = []
    base = sorted(x for c in contours for (x, y) in c if y <= y0 + 2)
    stem = (base[-1] - base[0]) if len(base) >= 2 else (x1 - x0) * 0.16
    clockwise = signed_area(max(contours, key=lambda c: abs(signed_area(c)))) < 0
    cx = (base[0] + base[-1]) / 2 if len(base) >= 2 else (x0 + x1) / 2
    cap = y1
    th = stem * 0.62            # stroke thickness
    half = (x1 - x0) * 0.36     # half the stroke's length
    rise = half * 0.42          # the slant: up to the right, as in ₮
    pen = TTGlyphPen(gs)
    t.draw(pen)
    for yc in (cap * 0.30, cap * 0.53):
        quad = [(cx - half, yc - th / 2 - rise), (cx + half, yc - th / 2 + rise), (cx + half, yc + th / 2 + rise), (cx - half, yc + th / 2 - rise)]
        if clockwise != (signed_area(quad) < 0): quad.reverse()
        pen.moveTo(tuple(round(v) for v in quad[0]))
        for p in quad[1:]: pen.lineTo(tuple(round(v) for v in p))
        pen.closePath()
    glyph = pen.glyph()
    adv, lsb = font["hmtx"][tname]

    fb = FontBuilder(font["head"].unitsPerEm, isTTF=True)
    fb.setupGlyphOrder([".notdef", "tugrik"])
    fb.setupCharacterMap({0x20AE: "tugrik"})
    notdef = TTGlyphPen(None).glyph()
    fb.setupGlyf({".notdef": notdef, "tugrik": glyph})
    glyph.recalcBounds(fb.font["glyf"])
    fb.setupHorizontalMetrics({".notdef": (adv, 0), "tugrik": (adv, glyph.xMin)})
    hh, os2 = font["hhea"], font["OS/2"]
    fb.setupHorizontalHeader(ascent=hh.ascent, descent=hh.descent)
    fam = {"sans": "Fusebox Tug Sans", "mono": "Fusebox Tug Mono", "display": "Fusebox Tug Display"}[key.split("-")[0]]
    fb.setupNameTable({"familyName": fam, "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=os2.sTypoAscender, sTypoDescender=os2.sTypoDescender, sTypoLineGap=os2.sTypoLineGap, usWinAscent=os2.usWinAscent, usWinDescent=os2.usWinDescent, usWeightClass=int(key.split("-")[1]))
    fb.setupPost()
    (WEB / "public/fonts").mkdir(parents=True, exist_ok=True)
    fb.font.flavor = None
    fb.save(str(WEB / f"assets/og/tug-{key}.ttf"))
    fb.font.flavor = "woff2"
    fb.save(str(WEB / f"public/fonts/tug-{key}.woff2"))
    print(f"tug-{key}: stem {stem:.0f}, cap {cap:.0f}, advance {adv}")


for k, (p, loc) in SRC.items():
    build(k, p, loc)

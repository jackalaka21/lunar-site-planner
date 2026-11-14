"""Draws the Ridgeline icons and the social card. Run once: python scripts/make-brand-assets.py

Colours match the graphite theme (theme/ridgeline.theme.ts): body #141415, ink #ededed, muted #a1a1a6, Sun #f5a524.
The glyph is a horizon profile (a ridge line over a baseline). No planets, no starfield.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BG, INK, MUTED, SUN = "#141415", "#ededed", "#a1a1a6", "#f5a524"
SS = 4  # supersampling factor

# Ridge profile as (x, y) in a 0..1 box, left to right.
RIDGE = [(0.0, 0.70), (0.14, 0.62), (0.24, 0.66), (0.38, 0.40), (0.47, 0.50), (0.58, 0.30), (0.70, 0.52), (0.80, 0.46), (0.90, 0.60), (1.0, 0.56)]


def glyph(draw: ImageDraw.ImageDraw, x0: float, y0: float, w: float, h: float, stroke: float) -> None:
    pts = [(x0 + x * w, y0 + y * h) for x, y in RIDGE]
    draw.line(pts, fill=INK, width=round(stroke), joint="curve")
    r = stroke / 2
    for px, py in (pts[0], pts[-1]):
        draw.ellipse((px - r, py - r, px + r, py + r), fill=INK)
    base = y0 + 0.86 * h
    draw.line([(x0, base), (x0 + w, base)], fill=MUTED, width=max(1, round(stroke / 2)))


def icon(size: int, safe: float, path: Path) -> None:
    big = size * SS
    im = Image.new("RGB", (big, big), BG)
    d = ImageDraw.Draw(im)
    inner = big * safe
    off = (big - inner) / 2
    glyph(d, off, off + inner * 0.08, inner, inner * 0.84, big * 0.028)
    im.resize((size, size), Image.LANCZOS).save(path, optimize=True)


def font(weight: int, px: int) -> ImageFont.FreeTypeFont:
    name = f"ibm-plex-sans-latin-{weight}-normal.woff"
    return ImageFont.truetype(str(ROOT / "node_modules/@fontsource/ibm-plex-sans/files" / name), px)


def og(path: Path) -> None:
    w, h = 1200, 630
    im = Image.new("RGB", (w * SS, h * SS), BG)
    d = ImageDraw.Draw(im)
    # Ridge across the lower half, Sun disc above it at the left of centre.
    glyph(d, 60 * SS, 330 * SS, 1080 * SS, 240 * SS, 5 * SS)
    sx, sy, sr = 700 * SS, 360 * SS, 22 * SS
    d.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=SUN)
    im = im.resize((w, h), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    d.text((72, 96), "Ridgeline", font=font(500, 84), fill=INK)
    d.text((72, 206), "Lunar landing site and date planner", font=font(400, 38), fill=MUTED)
    d.text((72, 258), "Sunlight and Earth contact against the real terrain horizon", font=font(400, 28), fill=MUTED)
    im.save(path, optimize=True)


if __name__ == "__main__":
    out = ROOT / "public"
    icon(192, 0.86, out / "icons/icon-192.png")
    icon(512, 0.86, out / "icons/icon-512.png")
    icon(512, 0.62, out / "icons/maskable-512.png")  # glyph inside the 80% maskable safe zone
    icon(180, 0.86, out / "icons/apple-touch-icon.png")
    og(out / "og.png")

"""
Génère les 24 images de décoration (Phase 10.4, White Alpha) : dégradés et
formes abstraites originaux, procéduraux, créés spécialement pour ce projet
(aucune photo, aucune image tierce, aucun élément FitPro). Sortie WebP,
360x640 (ratio portrait téléphone), légères (dégradés = très compressibles).

Usage : python scripts/generate-decoration-assets.py
(nécessite Pillow : pip install pillow)
"""

import os
import random

from PIL import Image, ImageDraw, ImageFilter

OUT_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "images", "decorations")
W, H = 360, 640


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(w, h, top, bottom, diagonal=False):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            if diagonal:
                t = (x / (w - 1) + y / (h - 1)) / 2
            else:
                t = y / (h - 1)
            px[x, y] = lerp(top, bottom, t)
    return img


# Palette reprise telle quelle de l'app (constants/theme.ts / constants/appearance.ts)
BG = hx("#0D0F0C")
SURFACE = hx("#171913")
SURFACE_HIGH = hx("#21231B")
BORDER = hx("#33352B")
ACCENT = hx("#2F6B45")
ACCENT_BRIGHT = hx("#4CD97B")
MOSS = hx("#4B7F52")
TEAL = hx("#2C6E7A")
SLATE_BLUE = hx("#3B5B7A")
AMBER = hx("#B08A3E")
COPPER = hx("#A05A3B")
WINE = hx("#7A3B4E")
GRAPHITE = hx("#4A4D46")
CREAM = hx("#F6F4EF")

random.seed(20260721)


def save(img, category, name):
    out_dir = os.path.join(OUT_ROOT, category)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.webp")
    img.convert("RGB").save(path, "WEBP", quality=80, method=6)
    size_kb = os.path.getsize(path) / 1024
    print(f"{category}/{name}.webp  {size_kb:.1f} Ko")


def soft_glow(base, center, radius, color, max_alpha=140):
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = center
    steps = 60
    for i in range(steps, 0, -1):
        t = i / steps
        r = radius * t
        alpha = int(max_alpha * (1 - t) ** 2)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*color, alpha))
    overlay = overlay.filter(ImageFilter.GaussianBlur(8))
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def scatter_dots(base, count, color_choices, max_r=2, seed_offset=0):
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    rnd = random.Random(20260721 + seed_offset)
    w, h = base.size
    for _ in range(count):
        x, y = rnd.uniform(0, w), rnd.uniform(0, h * 0.6)
        r = rnd.uniform(0.6, max_r)
        color = rnd.choice(color_choices)
        alpha = rnd.randint(120, 230)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(*color, alpha))
    return Image.alpha_composite(base.convert("RGBA"), overlay)


# ---------------------------------------------------------------- white_alpha
def white_alpha_glow():
    img = gradient(W, H, SURFACE, BG)
    img = soft_glow(img, (W / 2, H * 0.38), 210, ACCENT_BRIGHT, max_alpha=110)
    return img


def white_alpha_banner():
    img = gradient(W, H, hx("#12140F"), BG, diagonal=True)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.polygon([(0, H * 0.42), (W, H * 0.30), (W, H * 0.40), (0, H * 0.52)], fill=(*ACCENT, 160))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def white_alpha_eye():
    img = gradient(W, H, BG, hx("#090A08"))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = W / 2, H * 0.42
    rw, rh = 92, 46
    draw.ellipse([cx - rw, cy - rh, cx + rw, cy + rh], fill=(*ACCENT_BRIGHT, 130))
    draw.ellipse([cx - rw * 0.35, cy - rh * 0.7, cx + rw * 0.35, cy + rh * 0.7], fill=(*BG, 255))
    overlay = overlay.filter(ImageFilter.GaussianBlur(2))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


# --------------------------------------------------------------------- wolves
def wolves_pack():
    img = gradient(W, H, hx("#2E312B"), GRAPHITE)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    n = 5
    for i in range(n):
        cx = (i + 0.5) * (W / n)
        draw.polygon(
            [(cx - 22, H * 0.22), (cx, H * 0.05), (cx + 22, H * 0.22)],
            fill=(*hx("#C9CBC4"), 60),
        )
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def wolves_claw():
    img = gradient(W, H, hx("#1B1D18"), BG)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for i, dx in enumerate([-60, 0, 60]):
        x0 = W * 0.5 + dx
        draw.line([(x0, H * 0.15), (x0 - 40, H * 0.75)], fill=(*hx("#9C988E"), 90), width=6)
    overlay = overlay.filter(ImageFilter.GaussianBlur(3))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def wolves_gaze():
    img = gradient(W, H, hx("#181C22"), BG)
    img = soft_glow(img, (W / 2, H * 0.4), 190, SLATE_BLUE, max_alpha=120)
    return img


# --------------------------------------------------------------------- nature
def nature_leaf():
    img = gradient(W, H, hx("#3A5A3D"), hx("#16210F"))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    rnd = random.Random(1)
    for _ in range(9):
        cx, cy = rnd.uniform(0, W), rnd.uniform(H * 0.1, H * 0.7)
        rw, rh = rnd.uniform(30, 60), rnd.uniform(14, 26)
        angle = rnd.uniform(0, 180)
        leaf = Image.new("RGBA", (int(rw * 2), int(rh * 2)), (0, 0, 0, 0))
        ld = ImageDraw.Draw(leaf)
        ld.ellipse([0, 0, rw * 2, rh * 2], fill=(*rnd.choice([MOSS, ACCENT]), 90))
        leaf = leaf.rotate(angle, expand=True)
        overlay.paste(leaf, (int(cx - leaf.width / 2), int(cy - leaf.height / 2)), leaf)
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def nature_dew():
    img = gradient(W, H, hx("#2F5850"), hx("#122019"))
    img = scatter_dots(img, 40, [CREAM, hx("#CFEFE0")], max_r=3, seed_offset=2)
    return img


def nature_meadow():
    img = gradient(W, H, AMBER, hx("#243B1D"))
    return img


# ----------------------------------------------------------------- mountains
def _mountain_ridge(color, base_h, jag, seed):
    rnd = random.Random(seed)
    pts = [(0, H)]
    x = 0
    while x < W:
        x += rnd.uniform(30, 55)
        y = base_h + rnd.uniform(-jag, jag)
        pts.append((min(x, W), y))
    pts.append((W, H))
    return pts


def mountains_ridge():
    img = gradient(W, H, SLATE_BLUE, hx("#C9D6DE"))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.polygon(_mountain_ridge(GRAPHITE, H * 0.62, 40, 11), fill=(*hx("#232A2E"), 210))
    draw.polygon(_mountain_ridge(GRAPHITE, H * 0.74, 30, 12), fill=(*hx("#171B1D"), 230))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def mountains_peak():
    img = gradient(W, H, hx("#4A6B85"), hx("#DCE7EC"))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.polygon([(W * 0.5, H * 0.22), (W * 0.18, H * 0.68), (W * 0.82, H * 0.68)], fill=(*hx("#20262A"), 235))
    draw.polygon([(W * 0.5, H * 0.22), (W * 0.42, H * 0.34), (W * 0.58, H * 0.34)], fill=(*CREAM, 235))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def mountains_dusk():
    img = gradient(W, H, COPPER, hx("#241713"))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.polygon(_mountain_ridge(BG, H * 0.66, 36, 21), fill=(*hx("#120B08"), 235))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


# --------------------------------------------------------------------- forest
def forest_canopy():
    img = gradient(W, H, hx("#22361F"), hx("#0E1710"))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    rnd = random.Random(3)
    x = 0
    while x < W:
        width = rnd.uniform(14, 26)
        h0 = H * rnd.uniform(0.55, 0.7)
        draw.rectangle([x, h0, x + width, H], fill=(*hx("#0B140C"), rnd.randint(120, 200)))
        x += width + rnd.uniform(18, 40)
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def forest_mist():
    img = gradient(W, H, hx("#2C4A35"), hx("#0E1B12"))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for i in range(5):
        y = H * (0.25 + i * 0.12)
        draw.rectangle([0, y, W, y + 30], fill=(*CREAM, 24))
    overlay = overlay.filter(ImageFilter.GaussianBlur(10))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def forest_trail():
    img = gradient(W, H, hx("#2A3F22"), hx("#171F12"))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.polygon(
        [(W * 0.46, H * 0.35), (W * 0.54, H * 0.35), (W * 0.7, H), (W * 0.3, H)],
        fill=(*hx("#6B5636"), 90),
    )
    return Image.alpha_composite(img.convert("RGBA"), overlay)


# ------------------------------------------------------------------ night_sky
def night_sky_stars():
    img = gradient(W, H, hx("#141634"), hx("#05060F"))
    img = scatter_dots(img, 70, [CREAM, hx("#CFE0FF")], max_r=1.8, seed_offset=4)
    return img


def night_sky_moon():
    img = gradient(W, H, hx("#181A38"), hx("#06070F"))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx, cy, r = W * 0.68, H * 0.24, 46
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*CREAM, 235))
    draw.ellipse([cx - r + 16, cy - r - 10, cx + r + 16, cy + r - 10], fill=(*hx("#181A38"), 255))
    base = Image.alpha_composite(img.convert("RGBA"), overlay)
    base = scatter_dots(base, 30, [CREAM], max_r=1.4, seed_offset=5)
    return base


def night_sky_aurora():
    img = gradient(W, H, hx("#0E1B22"), hx("#050A08"))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    rnd = random.Random(6)
    for i in range(3):
        y0 = H * (0.18 + i * 0.1)
        pts = [(0, y0)]
        x = 0
        while x < W:
            x += 30
            pts.append((x, y0 + rnd.uniform(-18, 18)))
        pts += [(W, y0 + 60), (0, y0 + 60)]
        draw.polygon(pts, fill=(*rnd.choice([ACCENT_BRIGHT, TEAL]), 55))
    overlay = overlay.filter(ImageFilter.GaussianBlur(6))
    base = Image.alpha_composite(img.convert("RGBA"), overlay)
    return scatter_dots(base, 25, [CREAM], max_r=1.2, seed_offset=7)


# -------------------------------------------------------------- dark_abstract
def dark_abstract_waves():
    img = gradient(W, H, hx("#1B1418"), BG)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    rnd = random.Random(8)
    for i in range(4):
        y0 = H * (0.15 + i * 0.18)
        pts = [(0, y0)]
        x = 0
        while x < W:
            x += 36
            pts.append((x, y0 + rnd.uniform(-24, 24)))
        pts += [(W, y0 + 50), (0, y0 + 50)]
        draw.polygon(pts, fill=(*rnd.choice([WINE, COPPER, GRAPHITE]), 70))
    overlay = overlay.filter(ImageFilter.GaussianBlur(4))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def dark_abstract_orbs():
    img = gradient(W, H, hx("#191420"), BG)
    for center, color, r in [
        ((W * 0.3, H * 0.3), WINE, 110),
        ((W * 0.7, H * 0.5), COPPER, 130),
        ((W * 0.45, H * 0.72), SLATE_BLUE, 100),
    ]:
        img = soft_glow(img, center, r, color, max_alpha=95)
    return img


def dark_abstract_grid():
    img = gradient(W, H, hx("#15161A"), BG)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    step = 40
    for x in range(0, W, step):
        draw.line([(x, 0), (x, H)], fill=(*hx("#3A3D45"), 60), width=1)
    for y in range(0, H, step):
        draw.line([(0, y), (W, y)], fill=(*hx("#3A3D45"), 60), width=1)
    return Image.alpha_composite(img.convert("RGBA"), overlay)


# ------------------------------------------------------------------- minimal
def minimal_slate():
    return gradient(W, H, hx("#23261F"), hx("#181A15"))


def minimal_paper():
    return gradient(W, H, hx("#FBFAF6"), hx("#EDEAE1"))


def minimal_ink():
    return gradient(W, H, hx("#101210"), hx("#080907"))


GENERATORS = [
    ("white_alpha", "white_alpha_glow", white_alpha_glow),
    ("white_alpha", "white_alpha_banner", white_alpha_banner),
    ("white_alpha", "white_alpha_eye", white_alpha_eye),
    ("wolves", "wolves_pack", wolves_pack),
    ("wolves", "wolves_claw", wolves_claw),
    ("wolves", "wolves_gaze", wolves_gaze),
    ("nature", "nature_leaf", nature_leaf),
    ("nature", "nature_dew", nature_dew),
    ("nature", "nature_meadow", nature_meadow),
    ("mountains", "mountains_ridge", mountains_ridge),
    ("mountains", "mountains_peak", mountains_peak),
    ("mountains", "mountains_dusk", mountains_dusk),
    ("forest", "forest_canopy", forest_canopy),
    ("forest", "forest_mist", forest_mist),
    ("forest", "forest_trail", forest_trail),
    ("night_sky", "night_sky_stars", night_sky_stars),
    ("night_sky", "night_sky_moon", night_sky_moon),
    ("night_sky", "night_sky_aurora", night_sky_aurora),
    ("dark_abstract", "dark_abstract_waves", dark_abstract_waves),
    ("dark_abstract", "dark_abstract_orbs", dark_abstract_orbs),
    ("dark_abstract", "dark_abstract_grid", dark_abstract_grid),
    ("minimal", "minimal_slate", minimal_slate),
    ("minimal", "minimal_paper", minimal_paper),
    ("minimal", "minimal_ink", minimal_ink),
]

if __name__ == "__main__":
    total = 0
    for category, name, fn in GENERATORS:
        img = fn()
        save(img, category, name)
    print("Terminé :", len(GENERATORS), "images")

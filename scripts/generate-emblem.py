"""Emblème original White Alpha (Phase 10.4, catégorie White Alpha, slot
"emblèmes") : sceau circulaire géométrique abstrait, palette de marque,
aucune reprise d'un visuel tiers, aucun visage ni figure de loup dessinée.

Usage : python scripts/generate-emblem.py
(nécessite Pillow : pip install pillow)
"""

import math
import os

from PIL import Image, ImageDraw, ImageFilter

W, H = 360, 640
BG = (13, 15, 12)
ACCENT = (47, 107, 69)
ACCENT_BRIGHT = (76, 217, 123)
BORDER = (51, 53, 43)

OUT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "assets",
    "images",
    "decorations",
    "white_alpha",
    "white_alpha_glow.webp",
)


def main():
    img = Image.new("RGB", (W, H), BG)
    cx, cy = W // 2, int(H * 0.42)

    # Halo doux derriere le sceau.
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for i in range(50, 0, -1):
        t = i / 50
        r = 150 * t
        alpha = int(90 * (1 - t) ** 2)
        gdraw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*ACCENT_BRIGHT, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(10))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Anneaux concentriques du sceau.
    for r, width, color in [(118, 3, ACCENT_BRIGHT), (100, 1, BORDER)]:
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=width)

    # Petits reperes autour de l'anneau (12, comme un cadran) : jamais un
    # texte, jamais un logo tiers, purement geometrique.
    for i in range(12):
        angle = math.radians(i * 30)
        r1, r2 = 108, 118
        x1, y1 = cx + r1 * math.sin(angle), cy - r1 * math.cos(angle)
        x2, y2 = cx + r2 * math.sin(angle), cy - r2 * math.cos(angle)
        draw.line([(x1, y1), (x2, y2)], fill=ACCENT_BRIGHT, width=2)

    # Motif central : silhouette geometrique abstraite (deux triangles =
    # oreilles stylisees, jamais une illustration figurative d'un visage).
    ear_w, ear_h = 34, 46
    draw.polygon(
        [(cx - 46, cy + 20), (cx - 46 + ear_w, cy + 20), (cx - 46 + ear_w / 2, cy + 20 - ear_h)],
        fill=ACCENT,
    )
    draw.polygon(
        [(cx + 46 - ear_w, cy + 20), (cx + 46, cy + 20), (cx + 46 - ear_w / 2, cy + 20 - ear_h)],
        fill=ACCENT,
    )
    draw.ellipse([cx - 42, cy - 6, cx + 42, cy + 46], fill=ACCENT)
    draw.ellipse([cx - 6, cy + 6, cx + 6, cy + 18], fill=BG)  # "oeil" unique, sobre

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    img.save(OUT_PATH, "WEBP", quality=85, method=6)
    print(OUT_PATH, os.path.getsize(OUT_PATH) / 1024, "Ko")


if __name__ == "__main__":
    main()

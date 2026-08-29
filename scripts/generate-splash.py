#!/usr/bin/env python3
"""Regenerate the Twake Drive launch-screen artwork, light and dark.

The native projects are hand-maintained (no `expo prebuild`), so the splash
images have to be produced and dropped in place. This script composes them from
assets/twake-mark.png (the gradient mark, transparent corners) plus the Inter
faces the app ships, so the launch screen matches the in-app typography.

Usage (from the repo root):
    python3 scripts/generate-splash.py

Writes:
    assets/splash.png                     light source, 1024
    assets/splash-dark.png                dark source, 1024
    ios/.../SplashScreenLegacy.imageset/  image{,@2x,@3x}.png + dark variants
    android/.../drawable*/splashscreen_logo.png
"""

import json
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "node_modules", "@expo-google-fonts", "inter")

# Sampled from the original artwork so the light variant keeps the brand values.
LIGHT = {"bg": (255, 255, 255), "strong": (29, 33, 39), "muted": (149, 153, 157)}
# cozyPalette.dark background / onSurface / onSurfaceVariant.
DARK = {"bg": (21, 23, 26), "strong": (227, 229, 232), "muted": (160, 164, 168)}

# Proportions of the original 1024 layout, kept so the mark does not shift.
CANVAS = 1024
LOGO_SIZE = 331
LOGO_TOP = 239
# TwakeLogo.tsx: a 32-unit square with rx 10.568.
CORNER_RATIO = 10.568 / 32
WORDMARK_TOP = 612
FONT_SIZE = 96
GAP = 22  # space between the two words


def load_mark() -> Image.Image:
    """The gradient mark, already carrying its rounded-corner alpha."""
    mark = Image.open(os.path.join(ROOT, "assets", "twake-mark.png")).convert("RGBA")
    return mark.resize((LOGO_SIZE, LOGO_SIZE), Image.LANCZOS)


def render(palette: dict) -> Image.Image:
    canvas = Image.new("RGB", (CANVAS, CANVAS), palette["bg"])
    mark = load_mark()
    canvas.paste(mark, ((CANVAS - LOGO_SIZE) // 2, LOGO_TOP), mark)

    bold = ImageFont.truetype(os.path.join(FONTS, "700Bold", "Inter_700Bold.ttf"), FONT_SIZE)
    regular = ImageFont.truetype(
        os.path.join(FONTS, "400Regular", "Inter_400Regular.ttf"), FONT_SIZE
    )
    draw = ImageDraw.Draw(canvas)
    w_twake = draw.textlength("Twake", font=bold)
    w_drive = draw.textlength("Drive", font=regular)
    x = (CANVAS - (w_twake + GAP + w_drive)) / 2
    draw.text((x, WORDMARK_TOP), "Twake", font=bold, fill=palette["strong"])
    draw.text((x + w_twake + GAP, WORDMARK_TOP), "Drive", font=regular, fill=palette["muted"])
    return canvas


def write_ios(light: Image.Image, dark: Image.Image) -> None:
    d = os.path.join(ROOT, "ios", "TwakeDrive", "Images.xcassets", "SplashScreenLegacy.imageset")
    images = []
    for scale, px in ((1, 414), (2, 828), (3, 1242)):
        suffix = "" if scale == 1 else f"@{scale}x"
        light.resize((px, px), Image.LANCZOS).save(os.path.join(d, f"image{suffix}.png"))
        dark.resize((px, px), Image.LANCZOS).save(os.path.join(d, f"image-dark{suffix}.png"))
        images.append({"idiom": "universal", "filename": f"image{suffix}.png", "scale": f"{scale}x"})
        images.append(
            {
                "idiom": "universal",
                "appearances": [{"appearance": "luminosity", "value": "dark"}],
                "filename": f"image-dark{suffix}.png",
                "scale": f"{scale}x",
            }
        )
    with open(os.path.join(d, "Contents.json"), "w") as f:
        json.dump({"images": images, "info": {"version": 1, "author": "expo"}}, f, indent=2)
        f.write("\n")


def write_android(light: Image.Image) -> None:
    base = os.path.join(ROOT, "android", "app", "src", "main", "res")
    # The Android splash draws the logo over a themed background colour, so the
    # single logo asset serves both themes; only the colour swaps in values-night.
    for folder, px in (
        ("drawable-mdpi", 288),
        ("drawable-hdpi", 432),
        ("drawable-xhdpi", 576),
        ("drawable-xxhdpi", 864),
        ("drawable-xxxhdpi", 1152),
    ):
        out = os.path.join(base, folder, "splashscreen_logo.png")
        if os.path.isdir(os.path.dirname(out)):
            light.resize((px, px), Image.LANCZOS).save(out)


def main() -> None:
    light = render(LIGHT)
    dark = render(DARK)
    light.save(os.path.join(ROOT, "assets", "splash.png"))
    dark.save(os.path.join(ROOT, "assets", "splash-dark.png"))
    write_ios(light, dark)
    write_android(light)
    print("splash artwork regenerated (light + dark)")


if __name__ == "__main__":
    main()

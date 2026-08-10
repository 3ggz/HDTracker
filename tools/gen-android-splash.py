#!/usr/bin/env python3
"""Regenerate the Android launch-screen images.

The Capacitor template ships a blue Capacitor logo as `@drawable/splash`,
which AppTheme.NoActionBarLaunch paints full-screen on every cold start —
so an app called "HD Security" opened with someone else's branding. These
match the launcher icon instead: #0B0B0D with a white HD mark.

Needs Pillow (`pip3 install pillow`). Overwrites every splash.png in
android/app/src/main/res/drawable*/ at its existing size, so adding a
density folder is enough for it to be covered next run.

    python3 tools/gen-android-splash.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BACKGROUND = (0x0B, 0x0B, 0x0D)
RES = Path(__file__).resolve().parent.parent / "android/app/src/main/res"

# Helvetica Neue lives in a collection; the bold face's index moves between
# macOS releases, so probe for it by name rather than hardcoding a number.
FONT_CANDIDATES = [
    ("/System/Library/Fonts/HelveticaNeue.ttc", "Bold"),
    ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", None),
    ("/Library/Fonts/Arial Bold.ttf", None),
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path, want in FONT_CANDIDATES:
        if not Path(path).exists():
            continue
        if want is None:
            return ImageFont.truetype(path, size)
        for index in range(16):
            try:
                font = ImageFont.truetype(path, size, index=index)
            except OSError:
                break
            family, style = font.getname()
            if want in style and "Italic" not in style and "Condensed" not in family:
                return font
    return ImageFont.load_default(size)


def render(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(image)
    font = load_font(max(12, int(min(width, height) * 0.22)))
    left, top, right, bottom = draw.textbbox((0, 0), "HD", font=font)
    draw.text(
        ((width - (right - left)) / 2 - left, (height - (bottom - top)) / 2 - top),
        "HD",
        font=font,
        fill=(0xFF, 0xFF, 0xFF),
    )
    return image


def main() -> None:
    for path in sorted(RES.glob("drawable*/splash.png")):
        with Image.open(path) as existing:
            size = existing.size
        render(*size).save(path, "PNG", optimize=True)
        print(f"{path.relative_to(RES.parent)} {size[0]}x{size[1]}")


if __name__ == "__main__":
    main()

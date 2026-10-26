"""Android launcher icons from public/App-Icons (the personalisation icons, settings/app-icons.js).

For each icon: an adaptive icon (Android 8+, the launcher cuts it to its own shape) and a plain
one for older systems, at every density. Run again after adding or changing an icon:

    python scripts/android-app-icons.py

Needs Pillow. Writes into src-tauri/gen/android/app/src/main/res and prints the activity-alias
names the manifest has to list (AndroidManifest.xml, one <activity-alias> per icon).

The artwork is a full rounded square. An adaptive icon shows only the middle 72 of its 108dp,
so the artwork is scaled until its largest fully opaque centred square covers those 72dp:
whatever mask the launcher uses, its rounded corners stay outside.
"""
import glob
import os
import re

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "App-Icons")
RES = os.path.join(ROOT, "src-tauri", "gen", "android", "app", "src", "main", "res")
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
DEFAULT = "Kodama App Icon - Standard Pink.png"


def slug(path):
    name = os.path.splitext(os.path.basename(path))[0].replace("Kodama App Icon - ", "")
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def opaque_square(im):
    """Side of the largest centred square whose pixels are all (nearly) opaque."""
    a = im.split()[3]
    w = im.width
    c = w // 2
    lo, hi = 0, c
    while lo < hi:
        h = (lo + hi + 1) // 2
        box = a.crop((c - h, c - h, c + h, c + h))
        if box.getextrema()[0] >= 250:
            lo = h
        else:
            hi = h - 1
    return 2 * lo


def write_icon(src, name):
    art = Image.open(src).convert("RGBA")
    # All icons share one outline, whose opaque square is 872-874 of 1024. One with see-through
    # artwork inside (3D Pink's gloss) would measure far less, so it gets the outline's.
    inner = opaque_square(art)
    if inner < art.width * 0.8:
        inner = round(art.width * 874 / 1024)
    # Artwork size in dp so that its opaque square spans the visible 72dp.
    art_dp = art.width * 72 / inner
    for dens, k in DENSITIES.items():
        folder = os.path.join(RES, f"mipmap-{dens}")
        os.makedirs(folder, exist_ok=True)
        # Adaptive foreground: 108dp, the artwork centred and scaled as above.
        canvas = round(108 * k)
        size = round(art_dp * k)
        # Behind it the same artwork, larger, so the whole 108dp is filled: launchers that show
        # more than the middle 72 for a moment (opening, parallax) find no empty margin.
        big = round(canvas / 0.8)
        fg = art.resize((big, big), Image.LANCZOS).crop(((big - canvas) // 2, (big - canvas) // 2, (big - canvas) // 2 + canvas, (big - canvas) // 2 + canvas))
        scaled = art.resize((size, size), Image.LANCZOS)
        off = (canvas - size) // 2  # the artwork is always smaller than 108dp (it fills 72 / ~0.8)
        fg.alpha_composite(scaled, (off, off))
        fg.save(os.path.join(folder, f"{name}_foreground.png"), optimize=True)
        # Plain icon for Android 7: the artwork as it is, 48dp.
        legacy = art.resize((round(48 * k), round(48 * k)), Image.LANCZOS)
        legacy.save(os.path.join(folder, f"{name}.png"), optimize=True)
        legacy.save(os.path.join(folder, f"{name}_round.png"), optimize=True)
    anydpi = os.path.join(RES, "mipmap-anydpi-v26")
    os.makedirs(anydpi, exist_ok=True)
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background" />\n'
        f'    <foreground android:drawable="@mipmap/{name}_foreground" />\n'
        '</adaptive-icon>\n'
    )
    for suffix in ("", "_round"):
        with open(os.path.join(anydpi, f"{name}{suffix}.xml"), "w", encoding="utf-8") as f:
            f.write(xml)


def main():
    files = sorted(glob.glob(os.path.join(SRC, "*.png")))
    for src in files:
        write_icon(src, f"ic_launcher_{slug(src)}")
    # The app's own icon (and what a launcher without the aliases shows) is the default one.
    write_icon(os.path.join(SRC, DEFAULT), "ic_launcher")
    print("aliases:", ", ".join(slug(f) for f in files))


if __name__ == "__main__":
    main()

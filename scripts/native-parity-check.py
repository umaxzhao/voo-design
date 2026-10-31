#!/usr/bin/env python3
"""1:1 screenshot parity checker for VOO Design Native vs the web editor.

Usage:
    python3 scripts/native-parity-check.py --region all
    python3 scripts/native-parity-check.py --region toolrail layers --save-dir /tmp/parity

For every region it
  1. normalises the native capture (2x retina) to the web reference size,
  2. finds the element bounding box in both images by scanning for the
     element's own surface colour inside a search window,
  3. prints x/y/w/h deltas in web pixels (1x, 1440x900 space),
  4. optionally writes side-by-side crops for eyeballing.

The web references live in .agents/teamwork/lead_refs/ and were captured at
1440x900. They are older than the current web source, so metrics are the
authority; exact pixels are advisory.
"""

from __future__ import annotations

import argparse
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NATIVE_DIR = os.path.join(ROOT, "native_studio", "docs", "screenshots")
REF_DIR = os.path.join(ROOT, "native_studio", "docs", "refs", "web_20261031")


def load(path: str) -> Image.Image:
    return Image.open(path).convert("RGB")


def normalise(img: Image.Image, size: tuple[int, int] = (1440, 900)) -> Image.Image:
    if img.size == size:
        return img
    return img.resize(size, Image.LANCZOS)


def close_to(pixel, colour, tol: int) -> bool:
    return all(abs(pixel[i] - colour[i]) <= tol for i in range(3))


def bbox_of_colour(
    img: Image.Image,
    window: tuple[int, int, int, int],
    colour: tuple[int, int, int],
    tol: int = 6,
    min_run: int = 12,
) -> tuple[int, int, int, int] | None:
    """Bounding box of pixels matching `colour` inside `window` (x0, y0, x1, y1).

    A row/column only counts when it holds at least `min_run` matching pixels so
    single anti-aliased pixels cannot inflate the box.
    """
    x0, y0, x1, y1 = window
    xs, ys = [], []
    for y in range(y0, min(y1, img.height)):
        run = 0
        for x in range(x0, min(x1, img.width)):
            if close_to(img.getpixel((x, y)), colour, tol):
                run += 1
            else:
                if run >= min_run:
                    xs.extend((x - run, x - 1))
                run = 0
        if run >= min_run:
            xs.extend((min(x1, img.width) - run, min(x1, img.width) - 1))
        if xs:
            ys.append(y)
    if not xs or not ys:
        return None
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def bbox_of_dark_surface(
    img: Image.Image,
    window: tuple[int, int, int, int],
    max_luma: int = 22,
    min_run: int = 30,
) -> tuple[int, int, int, int] | None:
    """Bounding box of a near-black floating surface (pills, cards) on the stage."""
    x0, y0, x1, y1 = window
    xs, ys = [], []
    for y in range(y0, min(y1, img.height)):
        run = 0
        for x in range(x0, min(x1, img.width)):
            r, g, b = img.getpixel((x, y))
            luma = 0.299 * r + 0.587 * g + 0.114 * b
            if luma <= max_luma:
                run += 1
            else:
                if run >= min_run:
                    xs.extend((x - run, x - 1))
                run = 0
        if run >= min_run:
            xs.extend((min(x1, img.width) - run, min(x1, img.width) - 1))
        if xs:
            ys.append(y)
    if not xs or not ys:
        return None
    return (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


REGIONS: dict[str, dict] = {
    # name: window, detection strategy, params
    "toolrail": {
        "native": "w_editor.png",
        "web": "web_editor.png",
        "window": (250, 40, 1200, 125),
        "mode": "dark",
        "args": {"max_luma": 20, "min_run": 120},
    },
    "layers": {
        "native": "w_editor.png",
        "web": "web_editor.png",
        "window": (10, 340, 300, 600),
        "mode": "dark",
        "args": {"max_luma": 20, "min_run": 80},
    },
    "zoom_bar": {
        "native": "w_editor.png",
        "web": "web_editor.png",
        "window": (590, 835, 860, 900),
        "mode": "light",
        "args": {"colour": (227, 227, 227), "tol": 12, "min_run": 20},
    },
    "page_pill": {
        "native": "w_editor.png",
        "web": "web_editor.png",
        "window": (8, 840, 220, 900),
        "mode": "dark",
        "args": {"max_luma": 26, "min_run": 40},
    },
    "properties": {
        "native": "w_editor.png",
        "web": "web_editor.png",
        "window": (1080, 240, 1440, 760),
        "mode": "dark",
        "args": {"max_luma": 20, "min_run": 80},
    },
}


def measure(img: Image.Image, spec: dict) -> tuple[int, int, int, int] | None:
    window = spec["window"]
    if spec["mode"] == "dark":
        return bbox_of_dark_surface(img, window, **spec["args"])
    colour = spec["args"].pop("colour") if "colour" in spec["args"] else (255, 255, 255)
    return bbox_of_colour(img, window, colour, **spec["args"])


def fmt(box) -> str:
    if box is None:
        return "—"
    x0, y0, x1, y1 = box
    return f"x={x0} y={y0} w={x1 - x0} h={y1 - y0}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", nargs="*", default=["all"])
    parser.add_argument("--save-dir", default="")
    args = parser.parse_args()

    names = list(REGIONS) if "all" in args.region else args.region
    if args.save_dir:
        os.makedirs(args.save_dir, exist_ok=True)

    rows = []
    for name in names:
        spec = REGIONS[name]
        n_path = os.path.join(NATIVE_DIR, spec["native"])
        w_path = os.path.join(REF_DIR, spec["web"])
        if not (os.path.exists(n_path) and os.path.exists(w_path)):
            rows.append((name, "missing capture", "-", "-"))
            continue
        n_img = normalise(load(n_path))
        w_img = normalise(load(w_path))
        n_box = measure(n_img, spec)
        w_box = measure(w_img, spec)

        if n_box and w_box:
            delta = (
                f"dx={n_box[0] - w_box[0]:+d} dy={n_box[1] - w_box[1]:+d} "
                f"dw={(n_box[2] - n_box[0]) - (w_box[2] - w_box[0]):+d} "
                f"dh={(n_box[3] - n_box[1]) - (w_box[3] - w_box[1]):+d}"
            )
        else:
            delta = "n/a"

        rows.append((name, fmt(n_box), fmt(w_box), delta))

        if args.save_dir and n_box and w_box:
            pad = 16
            wx0, wy0, wx1, wy1 = spec["window"]
            crop_n = n_img.crop((max(wx0 - pad, 0), max(wy0 - pad, 0), wx1 + pad, wy1 + pad))
            crop_w = w_img.crop((max(wx0 - pad, 0), max(wy0 - pad, 0), wx1 + pad, wy1 + pad))
            sheet = Image.new("RGB", (crop_w.width, crop_w.height * 2 + 6), (40, 0, 0))
            sheet.paste(crop_w, (0, 0))
            sheet.paste(crop_n, (0, crop_w.height + 6))
            sheet.save(os.path.join(args.save_dir, f"{name}.png"))

    width = max(len(r[0]) for r in rows) + 2
    print(f"{'region'.ljust(width)}{'native'.ljust(30)}{'web'.ljust(30)}delta")
    print("-" * (width + 60 + 30))
    for row in rows:
        print(f"{row[0].ljust(width)}{row[1].ljust(30)}{row[2].ljust(30)}{row[3]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""
NEMO — rasterise a scene snapshot to PNG.

Development aid: draws the ink produced by `scripts/snapshot.ts` so handwriting
and layout can be inspected without a browser.

    node scripts/snapshot.ts binary | python scripts/snapshot.py board.png
"""

from __future__ import annotations

import json
import sys

from PIL import Image, ImageDraw


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = (value or "#f4f1e8").lstrip("#")
    if len(value) != 6:
        return (244, 241, 232)
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def parse_fill(value: str) -> tuple[int, int, int, int]:
    """Accept the rgba(...) strings the highlight builder emits."""
    if value.startswith("rgba"):
        parts = value[value.index("(") + 1 : value.index(")")].split(",")
        r, g, b = (int(float(p)) for p in parts[:3])
        a = int(float(parts[3]) * 255) if len(parts) > 3 else 60
        return (r, g, b, a)
    r, g, b = hex_to_rgb(value)
    return (r, g, b, 60)


def main() -> int:
    out_path = sys.argv[1] if len(sys.argv) > 1 else "board.png"
    scale = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    data = json.load(sys.stdin)

    bounds = data["bounds"]
    pad = 60
    width = int((bounds["w"] + pad * 2) * scale)
    height = int((bounds["h"] + pad * 2) * scale)
    ox = -bounds["x"] + pad
    oy = -bounds["y"] + pad

    image = Image.new("RGB", (width, height), (8, 9, 12))
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    odraw = ImageDraw.Draw(overlay)

    for node in data["nodes"]:
        for stroke in node["strokes"]:
            pts = [((x + ox) * scale, (y + oy) * scale) for x, y in stroke["points"]]
            if len(pts) < 2:
                continue
            if stroke["fill"]:
                odraw.polygon(pts, fill=parse_fill(stroke["fill"]))
            else:
                draw.line(
                    pts,
                    fill=hex_to_rgb(stroke["color"]),
                    width=max(1, int(round(stroke["width"] * scale))),
                    joint="curve",
                )

    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    image.save(out_path)
    print(f"{out_path}  {width}x{height}  nodes={len(data['nodes'])}  '{data['question']}'")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

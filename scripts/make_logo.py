"""Write the sample company's logo, a small PNG with no dependencies.

Run with ``uv run python scripts/make_logo.py``; the PNG it writes is
committed beside it in ``backend/app/assets/``.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

WIDTH, HEIGHT = 96, 72

INK = (7, 59, 76, 255)  # #073B4C, the brand's ink
GREEN = (6, 214, 160, 255)  # #06D6A0, the accent
PAPER = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def inside_rounded_square(x: int, y: int) -> bool:
    left, top, right, bottom, radius = 4, 4, 68, 68, 14
    if not (left <= x < right and top <= y < bottom):
        return False
    corner_x = left + radius if x < left + radius else right - 1 - radius
    corner_y = top + radius if y < top + radius else bottom - 1 - radius
    if (x < left + radius or x >= right - radius) and (
        y < top + radius or y >= bottom - radius
    ):
        return (x - corner_x) ** 2 + (y - corner_y) ** 2 <= radius**2
    return True


def pixel(x: int, y: int) -> tuple[int, int, int, int]:
    """The sheet the mark draws: an invoice on the brand's ink."""
    if not inside_rounded_square(x, y):
        return CLEAR
    # The sheet, with its top-right corner folded back.
    sheet_left, sheet_top, sheet_right, sheet_bottom = 22, 16, 58, 60
    fold = 10
    on_sheet = sheet_left <= x < sheet_right and sheet_top <= y < sheet_bottom
    on_fold = (
        sheet_right - fold <= x < sheet_right
        and sheet_top <= y < sheet_top + fold
        and (x - (sheet_right - fold)) >= (y - sheet_top)
    )
    if on_sheet and not on_fold:
        if y < sheet_top + 4:
            return GREEN if y >= sheet_top + 2 else PAPER
        if y in (30, 31, 38, 39, 46, 47) and x < sheet_right - 6:
            return INK
        if y == 54 and x < sheet_right - 14:
            return GREEN
        return PAPER
    if on_fold:
        return GREEN
    return INK


def chunk(kind: bytes, body: bytes) -> bytes:
    return (
        struct.pack(">I", len(body))
        + kind
        + body
        + struct.pack(">I", zlib.crc32(kind + body))
    )


def build() -> bytes:
    rows = b"".join(
        b"\x00" + b"".join(struct.pack("4B", *pixel(x, y)) for x in range(WIDTH))
        for y in range(HEIGHT)
    )
    return b"".join(
        (
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 6, 0, 0, 0)),
            chunk(b"IDAT", zlib.compress(rows, 9)),
            chunk(b"IEND", b""),
        )
    )


def main() -> None:
    target = (
        Path(__file__).resolve().parent.parent
        / "backend"
        / "app"
        / "assets"
        / "brightloop-logo.png"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(build())
    print(f"Wrote {target}")


if __name__ == "__main__":
    main()

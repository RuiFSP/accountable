"""What an uploaded logo really is: read from its bytes, whatever its name says.

A PNG or a JPEG of at most 1 MB, kept in the company settings row. Anything
else is refused, an SVG included, so nothing but a picture is ever drawn onto
an invoice. The upload form checks the same way before it sends.
"""

from __future__ import annotations

from io import BytesIO

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

MAX_LOGO_BYTES = 1_048_576  # 1 MB

PNG = "image/png"
JPEG = "image/jpeg"

NOT_AN_IMAGE = "The logo must really be a PNG or a JPEG image."
TOO_BIG = "The logo must be a PNG or a JPEG image of at most 1 MB."

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_JPEG_MAGIC = b"\xff\xd8\xff"


def content_type_of(data: bytes) -> str | None:
    """The image type the bytes really are, or None when they are not one."""
    if data.startswith(_PNG_MAGIC):
        return PNG
    if data.startswith(_JPEG_MAGIC):
        return JPEG
    return None


def checked_type(data: bytes) -> str:
    """The type to keep the logo under, or a 400 with a clear message.

    The name the upload came under never matters here: the bytes must both
    start with a picture's magic and decode as that picture, so a truncated
    PNG that would break the PDF is refused at upload.
    """
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail=TOO_BIG)
    found = content_type_of(data)
    if found is None:
        raise HTTPException(status_code=400, detail=NOT_AN_IMAGE)
    try:
        with Image.open(BytesIO(data)) as picture:
            picture.load()
            actual = {"PNG": PNG, "JPEG": JPEG}.get(picture.format)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(status_code=400, detail=NOT_AN_IMAGE) from None
    if actual != found:
        raise HTTPException(status_code=400, detail=NOT_AN_IMAGE)
    return found

"""Reading a PDF back for the tests: the words drawn on it and its ink.

fpdf2 draws text as the font's own codes, so the words come back through the
document's ToUnicode table. Only what the Proof asks is read here: which text
is drawn and which colors are used. The change brings fpdf2 alone as a
dependency (plan, Risks 1), so the tests read the little they need themselves.
"""

from __future__ import annotations

import re
import zlib

_STREAM = re.compile(rb"stream\r?\n(.*?)\r?\nendstream", re.S)
_OBJECT = re.compile(rb"(\d+)\s+0\s+obj(.*?)endobj", re.S)
_FONT_REF = re.compile(rb"/Font\s*<<(.*?)>>", re.S)
_REF = re.compile(rb"/(F\d+)\s+(\d+)\s+0\s+R")
_TO_UNICODE = re.compile(rb"/ToUnicode\s+(\d+)\s+0\s+R")
_BFCHAR = re.compile(rb"beginbfchar(.*?)endbfchar", re.S)
_BFRANGE = re.compile(rb"beginbfrange(.*?)endbfrange", re.S)
_PAIR = re.compile(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>")
_RANGE = re.compile(rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>")
_RUN = re.compile(rb"/(F\d+)\s+[\d.]+\s+Tf|\(((?:[^()\\]|\\.)*)\)\s*Tj")
_COLOR = re.compile(rb"([\d.]+) ([\d.]+) ([\d.]+) rg")
_ESCAPES = {
    ord("n"): 10,
    ord("r"): 13,
    ord("t"): 9,
    ord("("): 40,
    ord(")"): 41,
    ord("\\"): 92,
}


def text(pdf: bytes) -> str:
    """Every word drawn on the document, in the order it is drawn."""
    fonts = _fonts(pdf)
    words = []
    for body in _bodies(pdf):
        if b"Tj" not in body:
            continue
        current: dict[int, int] | None = None
        for match in _RUN.finditer(body):
            if match.group(1) is not None:
                current = fonts.get(match.group(1))
            elif current is not None:
                words.append(_decoded(_unescape(match.group(2)), current))
    return "".join(words)


def colors(pdf: bytes) -> list[tuple[float, float, float]]:
    """The RGB ink the document draws with, in order."""
    found = []
    for body in _bodies(pdf):
        for red, green, blue in _COLOR.findall(body):
            found.append((float(red), float(green), float(blue)))
    return found


def draws_with(pdf: bytes, rgb: tuple[int, int, int], tolerance: float = 0.002) -> bool:
    """Whether the document draws with this ink."""
    wanted = tuple(channel / 255 for channel in rgb)
    return any(
        all(abs(shown - asked) <= tolerance for shown, asked in zip(found, wanted))
        for found in colors(pdf)
    )


def _bodies(pdf: bytes) -> list[bytes]:
    bodies = []
    for raw in _STREAM.findall(pdf):
        try:
            bodies.append(zlib.decompress(raw))
        except zlib.error:
            bodies.append(raw)
    return bodies


def _fonts(pdf: bytes) -> dict[bytes, dict[int, int]]:
    """Each font name in the document, mapped back to the characters it draws."""
    objects = {number: body for number, body in _OBJECT.findall(pdf)}
    fonts = {}
    for block in _FONT_REF.findall(pdf):
        for name, number in _REF.findall(block):
            found = _TO_UNICODE.search(objects[number])
            if found is not None:
                fonts[name] = _cmap(_stream_of(objects[found.group(1)]))
    return fonts


def _stream_of(body: bytes) -> bytes:
    found = _STREAM.search(body)
    if found is None:
        return body
    raw = found.group(1)
    try:
        return zlib.decompress(raw)
    except zlib.error:
        return raw


def _cmap(body: bytes) -> dict[int, int]:
    mapping = {}
    for block in _BFCHAR.findall(body):
        for source, target in _PAIR.findall(block):
            mapping[int(source, 16)] = int(target[:4], 16)
    for block in _BFRANGE.findall(body):
        for low, high, target in _RANGE.findall(block):
            for offset, code in enumerate(range(int(low, 16), int(high, 16) + 1)):
                mapping[code] = int(target[:4], 16) + offset
    return mapping


def _decoded(codes: bytes, mapping: dict[int, int]) -> str:
    drawn = []
    for start in range(0, len(codes) - 1, 2):
        code = int.from_bytes(codes[start : start + 2], "big")
        drawn.append(chr(mapping.get(code, 0xFFFD)))
    return "".join(drawn)


def _unescape(raw: bytes) -> bytes:
    out = bytearray()
    index = 0
    while index < len(raw):
        byte = raw[index]
        if byte == ord("\\") and index + 1 < len(raw):
            following = raw[index + 1]
            if following in _ESCAPES:
                out.append(_ESCAPES[following])
                index += 2
                continue
            if chr(following).isdigit():
                digits = raw[index + 1 : index + 4]
                out.append(int(digits, 8))
                index += 1 + len(digits)
                continue
            index += 2
            continue
        out.append(byte)
        index += 1
    return bytes(out)

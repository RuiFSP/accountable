"""The uploaded logo: what is really accepted, and what comes back at its address."""

import base64
from io import BytesIO

import pytest
from app import db, images, seed
from PIL import Image
from sqlalchemy import create_engine


@pytest.fixture()
def engine(tmp_path):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'logo.db'}")
    db.metadata.create_all(test_engine)
    seed.ensure_settings(test_engine)
    yield test_engine
    test_engine.dispose()


def _picture(kind: str) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (4, 3), (200, 40, 40)).save(buffer, format=kind)
    return buffer.getvalue()


def _upload(client, data: bytes, content_type: str):
    return client.put(
        "/api/settings/logo",
        json={
            "content_type": content_type,
            "data": base64.b64encode(data).decode(),
        },
    )


def test_a_png_and_a_jpeg_are_accepted_whatever_their_name(client):
    png = _picture("PNG")
    jpeg = _picture("JPEG")

    as_jpeg = _upload(client, png, "image/jpeg")
    served_png = client.get("/api/settings/logo")
    as_png = _upload(client, jpeg, "image/png")
    served_jpeg = client.get("/api/settings/logo")

    assert as_jpeg.status_code == 200, as_jpeg.text
    assert as_jpeg.json()["logo_content_type"] == "image/png"
    assert served_png.status_code == 200
    assert served_png.headers["content-type"] == "image/png"
    assert served_png.content == png
    assert as_png.status_code == 200, as_png.text
    assert as_png.json()["logo_content_type"] == "image/jpeg"
    assert served_jpeg.headers["content-type"] == "image/jpeg"
    assert served_jpeg.content == jpeg


def test_a_text_file_renamed_to_end_in_png_is_refused(client):
    before = client.get("/api/settings/logo")
    refused = _upload(client, b"not a picture at all", "image/png")

    assert refused.status_code == 400
    assert refused.json()["detail"] == images.NOT_AN_IMAGE
    # The refusal stored nothing: the logo is the one it was.
    assert client.get("/api/settings/logo").content == before.content


def test_an_svg_is_refused(client):
    refused = _upload(
        client, b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', "image/png"
    )

    assert refused.status_code == 400
    assert refused.json()["detail"] == images.NOT_AN_IMAGE


def test_a_magic_header_around_a_broken_picture_is_refused(client):
    before = client.get("/api/settings/logo")
    refused = _upload(client, b"\x89PNG\r\n\x1a\n" + b"not a picture" * 20, "image/png")

    assert refused.status_code == 400
    assert refused.json()["detail"] == images.NOT_AN_IMAGE
    assert client.get("/api/settings/logo").content == before.content


def test_a_file_over_1mb_is_refused(client):
    big = b"\x89PNG\r\n\x1a\n" + b"0" * images.MAX_LOGO_BYTES

    refused = _upload(client, big, "image/png")

    assert refused.status_code == 400
    assert refused.json()["detail"] == images.TOO_BIG


def test_the_accepted_bytes_come_back_at_the_logos_address_with_their_content_type(
    client,
):
    png = _picture("PNG")

    saved = _upload(client, png, "image/png")
    served = client.get("/api/settings/logo")

    assert saved.json()["logo_content_type"] == "image/png"
    assert served.content == png
    assert served.headers["content-type"] == "image/png"

    removed = client.delete("/api/settings/logo")

    assert removed.status_code == 200
    assert removed.json()["logo_content_type"] is None
    assert client.get("/api/settings/logo").status_code == 404

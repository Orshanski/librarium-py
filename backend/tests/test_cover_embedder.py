"""Tests for FB2 and EPUB cover embedding."""
import base64
import os
import shutil
import zipfile
from io import BytesIO
from pathlib import Path

from lxml import etree
from PIL import Image

from app.cover_embedder import embed_cover_epub, embed_cover_fb2, to_jpeg

FIXTURES = Path(__file__).parent / "fixtures" / "books"

NS = {
    "fb": "http://www.gribuser.ru/xml/fictionbook/2.0",
    "l": "http://www.w3.org/1999/xlink",
}


def _make_test_jpeg(width: int = 20, height: int = 20, color: str = "red") -> bytes:
    """Create a small test JPEG and return its bytes."""
    img = Image.new("RGB", (width, height), color)
    buf = BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _extract_cover_from_fb2(file_path: Path) -> bytes:
    """Extract cover binary data from an FB2 file."""
    tree = etree.parse(str(file_path))
    coverpage = tree.xpath(
        "/fb:FictionBook/fb:description/fb:title-info/fb:coverpage/fb:image/@l:href",
        namespaces=NS,
    )
    assert coverpage, "No coverpage found in FB2"
    cover_id = coverpage[0].lstrip("#")
    binaries = tree.xpath("//fb:binary", namespaces=NS)
    binary = [b for b in binaries if b.get("id") == cover_id]
    assert binary, f"No binary with id={cover_id}"
    assert binary[0].get("content-type") == "image/jpeg"
    return base64.b64decode(binary[0].text.strip())


class TestEmbedCoverFb2ReplaceExisting:
    """Task 1: Replace existing cover in FB2."""

    def test_replaces_cover_and_roundtrips(self, tmp_path: Path):
        src = FIXTURES / "with-cover.fb2"
        dst = tmp_path / "with-cover.fb2"
        shutil.copy2(src, dst)

        cover_bytes = _make_test_jpeg(color="blue")

        embed_cover_fb2(dst, cover_bytes)

        extracted = _extract_cover_from_fb2(dst)
        assert extracted == cover_bytes

    def test_file_remains_valid_xml(self, tmp_path: Path):
        src = FIXTURES / "with-cover.fb2"
        dst = tmp_path / "with-cover.fb2"
        shutil.copy2(src, dst)

        embed_cover_fb2(dst, _make_test_jpeg())

        tree = etree.parse(str(dst))
        title = tree.xpath(
            "/fb:FictionBook/fb:description/fb:title-info/fb:book-title/text()",
            namespaces=NS,
        )
        assert title[0] == "Book With Cover"


class TestEmbedCoverFb2AddNew:
    """Task 2: Add cover to FB2 that has none."""

    def test_adds_cover_and_roundtrips(self, tmp_path: Path):
        src = FIXTURES / "no-cover.fb2"
        dst = tmp_path / "no-cover.fb2"
        shutil.copy2(src, dst)

        cover_bytes = _make_test_jpeg(color="green")

        embed_cover_fb2(dst, cover_bytes)

        extracted = _extract_cover_from_fb2(dst)
        assert extracted == cover_bytes

    def test_file_remains_valid_fb2(self, tmp_path: Path):
        src = FIXTURES / "no-cover.fb2"
        dst = tmp_path / "no-cover.fb2"
        shutil.copy2(src, dst)

        embed_cover_fb2(dst, _make_test_jpeg())

        tree = etree.parse(str(dst))
        title = tree.xpath(
            "/fb:FictionBook/fb:description/fb:title-info/fb:book-title/text()",
            namespaces=NS,
        )
        assert title[0] == "Book Without Cover"

        # Verify coverpage was created inside title-info
        coverpage = tree.xpath(
            "/fb:FictionBook/fb:description/fb:title-info/fb:coverpage",
            namespaces=NS,
        )
        assert len(coverpage) == 1


# --- EPUB helpers and tests ---

EPUB_NS = {
    "n": "urn:oasis:names:tc:opendocument:xmlns:container",
    "pkg": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
}


def _extract_cover_from_epub(file_path: Path) -> bytes:
    """Extract cover image data from an EPUB file."""
    with zipfile.ZipFile(str(file_path)) as zf:
        container = etree.fromstring(zf.read("META-INF/container.xml"))
        opf_path = container.xpath(
            "n:rootfiles/n:rootfile/@full-path", namespaces=EPUB_NS
        )[0]
        opf = etree.fromstring(zf.read(opf_path))
        cover_dir = os.path.dirname(opf_path)

        # Method 1: id="cover-image"
        hrefs = opf.xpath(
            "/pkg:package/pkg:manifest/pkg:item[@id='cover-image']/@href",
            namespaces=EPUB_NS,
        )
        if not hrefs:
            # Method 2: meta name="cover"
            meta_cover = opf.xpath(
                "/pkg:package/pkg:metadata/pkg:meta[@name='cover']/@content",
                namespaces=EPUB_NS,
            )
            if meta_cover:
                items = opf.xpath(
                    "/pkg:package/pkg:manifest/pkg:item", namespaces=EPUB_NS
                )
                hrefs = [
                    item.get("href")
                    for item in items
                    if item.get("id") == meta_cover[0]
                ]
        if not hrefs:
            # Method 3: properties="cover-image"
            hrefs = opf.xpath(
                "/pkg:package/pkg:manifest/pkg:item[@properties='cover-image']/@href",
                namespaces=EPUB_NS,
            )

        assert hrefs, "No cover found in EPUB"
        cover_zip_path = (
            os.path.join(cover_dir, hrefs[0]).replace("\\", "/")
            if cover_dir
            else hrefs[0]
        )
        return zf.read(cover_zip_path)


class TestEmbedCoverEpubReplaceExisting:
    """Task 3: Replace existing cover in EPUB."""

    def test_replaces_cover_and_roundtrips(self, tmp_path: Path):
        src = FIXTURES / "minimal.epub"
        dst = tmp_path / "minimal.epub"
        shutil.copy2(src, dst)

        cover_bytes = _make_test_jpeg(color="blue")

        embed_cover_epub(dst, cover_bytes)

        extracted = _extract_cover_from_epub(dst)
        assert extracted == cover_bytes

    def test_file_remains_valid_zip(self, tmp_path: Path):
        src = FIXTURES / "minimal.epub"
        dst = tmp_path / "minimal.epub"
        shutil.copy2(src, dst)

        embed_cover_epub(dst, _make_test_jpeg())

        # Verify valid ZIP
        assert zipfile.is_zipfile(str(dst))
        with zipfile.ZipFile(str(dst)) as zf:
            assert zf.testzip() is None

            # Verify title preserved
            container = etree.fromstring(zf.read("META-INF/container.xml"))
            opf_path = container.xpath(
                "n:rootfiles/n:rootfile/@full-path", namespaces=EPUB_NS
            )[0]
            opf = etree.fromstring(zf.read(opf_path))
            title = opf.xpath(
                "/pkg:package/pkg:metadata/dc:title/text()", namespaces=EPUB_NS
            )
            assert title[0] == "EPUB Test Book"


class TestEmbedCoverEpubAddNew:
    """Task 4: Add cover to EPUB that has none."""

    def test_adds_cover_and_roundtrips(self, tmp_path: Path):
        src = FIXTURES / "no-cover.epub"
        dst = tmp_path / "no-cover.epub"
        shutil.copy2(src, dst)

        cover_bytes = _make_test_jpeg(color="green")

        embed_cover_epub(dst, cover_bytes)

        extracted = _extract_cover_from_epub(dst)
        assert extracted == cover_bytes

    def test_file_remains_valid_zip_and_title_preserved(self, tmp_path: Path):
        src = FIXTURES / "no-cover.epub"
        dst = tmp_path / "no-cover.epub"
        shutil.copy2(src, dst)

        embed_cover_epub(dst, _make_test_jpeg())

        # Verify valid ZIP
        assert zipfile.is_zipfile(str(dst))
        with zipfile.ZipFile(str(dst)) as zf:
            assert zf.testzip() is None

            # Verify title preserved
            container = etree.fromstring(zf.read("META-INF/container.xml"))
            opf_path = container.xpath(
                "n:rootfiles/n:rootfile/@full-path", namespaces=EPUB_NS
            )[0]
            opf = etree.fromstring(zf.read(opf_path))
            title = opf.xpath(
                "/pkg:package/pkg:metadata/dc:title/text()", namespaces=EPUB_NS
            )
            assert title[0] == "EPUB Without Cover"


# --- to_jpeg tests ---


class TestConvertToJpeg:
    """Task 5: Convert PNG/WebP to JPEG."""

    def test_png_to_jpeg(self):
        img = Image.new("RGBA", (10, 10), (255, 0, 0, 128))
        buf = BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()

        result = to_jpeg(png_bytes)
        assert result[:2] == b"\xff\xd8"

    def test_webp_to_jpeg(self):
        img = Image.new("RGB", (10, 10), "green")
        buf = BytesIO()
        img.save(buf, format="WEBP")
        webp_bytes = buf.getvalue()

        result = to_jpeg(webp_bytes)
        assert result[:2] == b"\xff\xd8"

    def test_jpeg_passthrough(self):
        jpeg_bytes = _make_test_jpeg(color="blue")
        result = to_jpeg(jpeg_bytes)
        assert result is jpeg_bytes


# --- embed_cover orchestrator tests ---


class TestEmbedCover:
    """Task 6: embed_cover orchestrator."""

    def test_embed_cover_fb2(self, admin_client, db):
        from app.config import LIBRARY_DIR

        # Book 1 has FB2 file (minimal.fb2 → book.fb2). Put a cover on disk.
        book_dir = LIBRARY_DIR / "1"
        cover_bytes = _make_test_jpeg(color="purple")
        (book_dir / "cover.jpg").write_bytes(cover_bytes)

        from app.cover_embedder import embed_cover
        embed_cover(db, 1)

        # Extract cover from the FB2 file and verify
        fb2_path = book_dir / "book.fb2"
        extracted = _extract_cover_from_fb2(fb2_path)
        assert extracted == cover_bytes


# --- Integration tests ---


class TestCoverCommitIntegration:
    """Task 7: Integration — PUT /api/books/{id}/cover embeds into book files."""

    def test_commit_cover_embeds_into_fb2(self, admin_client):
        from app.config import LIBRARY_DIR

        # Upload a new cover
        cover_bytes = _make_test_jpeg(color="orange")
        resp = admin_client.post(
            "/api/books/1/cover",
            files={"file": ("cover.jpg", BytesIO(cover_bytes), "image/jpeg")},
        )
        assert resp.status_code == 200

        # Commit the cover
        resp = admin_client.put("/api/books/1/cover")
        assert resp.status_code == 200

        # Extract cover from FB2 file on disk and verify
        fb2_path = LIBRARY_DIR / "1" / "book.fb2"
        extracted = _extract_cover_from_fb2(fb2_path)
        assert extracted == cover_bytes

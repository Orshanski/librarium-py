"""Embed cover images into book files (FB2, EPUB)."""
import base64
import logging
import os
import sqlite3
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path

from lxml import etree  # pyright: ignore[reportAttributeAccessIssue]  # lxml stubs miss etree
from PIL import Image

from . import xml_safe
from .exceptions import BadInputError
from .logging_utils import safe as safe_log

log = logging.getLogger("librarium.cover_embedder")

NS = {
    "fb": "http://www.gribuser.ru/xml/fictionbook/2.0",
    "l": "http://www.w3.org/1999/xlink",
}
FB_NS = "http://www.gribuser.ru/xml/fictionbook/2.0"
XLINK_NS = "http://www.w3.org/1999/xlink"

_IMAGE_JPEG = "image/jpeg"
_COVER_JPG = "cover.jpg"


def embed_cover_fb2(file_path: Path, cover_bytes: bytes) -> None:
    """Embed or replace a cover image in an FB2 file.

    If a <coverpage> exists, replaces the referenced binary data.
    If no <coverpage> exists, creates one in <title-info> and adds
    a <binary> element at the end of the root.
    """
    tree = xml_safe.parse(file_path)
    root = tree.getroot()
    b64_text = base64.b64encode(cover_bytes).decode("ascii")

    coverpage = tree.xpath(
        "/fb:FictionBook/fb:description/fb:title-info/fb:coverpage/fb:image/@l:href",
        namespaces=NS,
    )

    if coverpage:
        # Replace existing cover binary
        cover_id = coverpage[0].lstrip("#")
        binaries = tree.xpath("//fb:binary", namespaces=NS)
        binary = [b for b in binaries if b.get("id") == cover_id]
        if binary:
            binary[0].text = b64_text
            binary[0].set("content-type", _IMAGE_JPEG)
        else:
            # Binary missing — create it
            bin_el = etree.SubElement(root, f"{{{FB_NS}}}binary")
            bin_el.set("id", cover_id)
            bin_el.set("content-type", _IMAGE_JPEG)
            bin_el.text = b64_text
    else:
        # No coverpage — create coverpage + binary
        title_info = tree.xpath(
            "/fb:FictionBook/fb:description/fb:title-info", namespaces=NS
        )
        if not title_info:
            raise BadInputError("FB2 file has no <title-info> element")

        cover_id = "cover"

        # Create <coverpage><image l:href="#cover"/></coverpage>
        coverpage_el = etree.SubElement(title_info[0], f"{{{FB_NS}}}coverpage")
        image_el = etree.SubElement(coverpage_el, f"{{{FB_NS}}}image")
        image_el.set(f"{{{XLINK_NS}}}href", f"#{cover_id}")

        # Create <binary> at end of root
        bin_el = etree.SubElement(root, f"{{{FB_NS}}}binary")
        bin_el.set("id", cover_id)
        bin_el.set("content-type", _IMAGE_JPEG)
        bin_el.text = b64_text

    tree.write(str(file_path), xml_declaration=True, encoding="utf-8")


EPUB_NS = {
    "n": "urn:oasis:names:tc:opendocument:xmlns:container",
    "pkg": "http://www.idpf.org/2007/opf",
}
OPF_NS = "http://www.idpf.org/2007/opf"


def embed_cover_epub(file_path: Path, cover_bytes: bytes) -> None:
    """Embed or replace a cover image in an EPUB file.

    Finds the OPF via META-INF/container.xml, then searches for an existing
    cover using 3 methods (same as the EPUB parser). If found, replaces the
    cover file. If not found, adds cover.jpg and updates the OPF manifest
    and metadata.
    """
    with zipfile.ZipFile(str(file_path), "r") as zf:
        container = xml_safe.fromstring(zf.read("META-INF/container.xml"))
        opf_path = container.xpath(
            "n:rootfiles/n:rootfile/@full-path", namespaces=EPUB_NS
        )[0]
        opf = xml_safe.fromstring(zf.read(opf_path))
        cover_dir = os.path.dirname(opf_path)

        # Search for existing cover using 3 methods
        cover_href = _find_epub_cover_href(opf)

        if cover_href is not None:
            # Resolve path inside ZIP
            cover_zip_path = (
                os.path.join(cover_dir, cover_href).replace("\\", "/")
                if cover_dir
                else cover_href
            )
        else:
            cover_zip_path = None

        # Rebuild ZIP: we must rewrite the entire archive
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".epub", dir=str(file_path.parent))
        os.close(tmp_fd)
        try:
            with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf_out:
                for item in zf.infolist():
                    if cover_zip_path and item.filename == cover_zip_path:
                        # Replace existing cover
                        zf_out.writestr(item, cover_bytes)
                    elif item.filename == opf_path and cover_href is None:
                        # No cover found — modify OPF to add cover references
                        new_opf_bytes = _add_cover_to_opf(opf)
                        zf_out.writestr(item, new_opf_bytes)
                    else:
                        zf_out.writestr(item, zf.read(item.filename))

                if cover_href is None:
                    # Add the cover image file
                    cover_new_path = (
                        os.path.join(cover_dir, _COVER_JPG).replace("\\", "/")
                        if cover_dir
                        else _COVER_JPG
                    )
                    zf_out.writestr(cover_new_path, cover_bytes)

            os.replace(tmp_path, str(file_path))
        except Exception:
            os.unlink(tmp_path)
            raise


def _find_epub_cover_href(opf: etree._Element) -> str | None:
    """Find cover image href in OPF manifest using 3 methods."""
    ns = EPUB_NS

    # Method 1: item with id="cover-image"
    hrefs = opf.xpath(
        "/pkg:package/pkg:manifest/pkg:item[@id='cover-image']/@href", namespaces=ns
    )
    if hrefs:
        return hrefs[0]

    # Method 2: meta name="cover" -> find item by that id
    meta_cover = opf.xpath(
        "/pkg:package/pkg:metadata/pkg:meta[@name='cover']/@content", namespaces=ns
    )
    if meta_cover:
        items = opf.xpath("/pkg:package/pkg:manifest/pkg:item", namespaces=ns)
        for item in items:
            if item.get("id") == meta_cover[0]:
                return item.get("href")

    # Method 3: properties="cover-image"
    hrefs = opf.xpath(
        "/pkg:package/pkg:manifest/pkg:item[@properties='cover-image']/@href",
        namespaces=ns,
    )
    if hrefs:
        return hrefs[0]

    return None


def _add_cover_to_opf(opf: etree._Element) -> bytes:
    """Add cover image references to OPF and return serialized XML."""
    ns = EPUB_NS

    # Add <item> to manifest
    manifest = opf.xpath("/pkg:package/pkg:manifest", namespaces=ns)[0]
    item = etree.SubElement(manifest, f"{{{OPF_NS}}}item")
    item.set("id", "cover-image")
    item.set("href", _COVER_JPG)
    item.set("media-type", _IMAGE_JPEG)
    item.set("properties", "cover-image")

    # Add <meta name="cover" content="cover-image"/> to metadata
    metadata = opf.xpath("/pkg:package/pkg:metadata", namespaces=ns)[0]
    meta = etree.SubElement(metadata, f"{{{OPF_NS}}}meta")
    meta.set("name", "cover")
    meta.set("content", "cover-image")

    return etree.tostring(opf, xml_declaration=True, encoding="utf-8")


def to_jpeg(image_bytes: bytes) -> bytes:
    """Convert image bytes to JPEG. If already JPEG, return as-is."""
    if image_bytes[:2] == b"\xff\xd8":
        return image_bytes
    img = Image.open(BytesIO(image_bytes))
    img = img.convert("RGB")
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def embed_cover(db: sqlite3.Connection, book_id: int) -> None:
    """Orchestrator: find cover on disk, convert to JPEG, embed into all book files."""
    from .config import LIBRARY_DIR
    from .dal.books import get_book_files

    book_dir = LIBRARY_DIR / str(book_id)
    if not book_dir.is_dir():
        log.warning("Book directory not found: %s", safe_log(book_dir))
        return

    # Find cover file
    cover_file = None
    for f in os.listdir(str(book_dir)):
        if f.startswith("cover.") and "bak" not in f:
            cover_file = f
            break

    if cover_file is None:
        log.warning("No cover file found for book %d", book_id)
        return  # book_id is int — safe to log directly

    cover_bytes = (book_dir / cover_file).read_bytes()
    jpeg_bytes = to_jpeg(cover_bytes)

    from .services.book_file_writer import _safe_ext

    files = get_book_files(db, book_id)
    for bf in files:
        fmt = bf["format"].upper()
        # Defense-in-depth: format из DB row, в normal flow это FB2/EPUB/PDF
        # (валидируется через _safe_ext при upload), но если когда-то проскочит
        # кривое значение через bug — путь поедет за пределы LIBRARY_DIR.
        try:
            ext_safe = _safe_ext(fmt.lower())
        except BadInputError:
            log.warning("Skipping book %d with invalid format %s", book_id, safe_log(fmt))
            continue
        file_path = LIBRARY_DIR / str(book_id) / f"book.{ext_safe}"
        if not file_path.exists():
            log.warning("File not found: %s", safe_log(file_path))
            continue
        if fmt == "FB2":
            log.info("Embedding cover into FB2: %s", safe_log(file_path))
            embed_cover_fb2(file_path, jpeg_bytes)
        elif fmt == "EPUB":
            log.info("Embedding cover into EPUB: %s", safe_log(file_path))
            embed_cover_epub(file_path, jpeg_bytes)
        else:
            log.debug("Skipping format %s for book %d", safe_log(fmt), book_id)

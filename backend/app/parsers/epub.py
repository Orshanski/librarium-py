import os
import zipfile
import logging
from lxml import etree
from . import ParsedMetadata

log = logging.getLogger(__name__)

NS = {
    "n": "urn:oasis:names:tc:opendocument:xmlns:container",
    "pkg": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
}

COVER_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def parse_epub(file_path: str) -> ParsedMetadata:
    meta = ParsedMetadata()
    try:
        with zipfile.ZipFile(file_path) as zf:
            # Find content.opf
            container = etree.fromstring(zf.read("META-INF/container.xml"))
            opf_path = container.xpath("n:rootfiles/n:rootfile/@full-path", namespaces=NS)[0]
            opf = etree.fromstring(zf.read(opf_path))
            cover_dir = os.path.dirname(opf_path)

            p = opf.xpath("/pkg:package/pkg:metadata", namespaces=NS)[0]

            # Title
            title = p.xpath("dc:title/text()", namespaces=NS)
            meta.title = title[0].strip() if title else ""

            # Authors
            creators = p.xpath("dc:creator/text()", namespaces=NS)
            if creators:
                for c in creators:
                    for a in c.split("&"):
                        a = a.strip()
                        if a:
                            meta.authors.append(a)

            # Language
            lang = p.xpath("dc:language/text()", namespaces=NS)
            meta.language = lang[0].split("-")[0].strip() if lang else None

            # Description
            desc = p.xpath("dc:description/text()", namespaces=NS)
            meta.description = desc[0].strip() if desc else None

            # Subjects (genres)
            subjects = p.xpath("dc:subject/text()", namespaces=NS)
            meta.genres = [s.strip() for s in subjects if s.strip()]

            # Publisher
            pub = p.xpath("dc:publisher/text()", namespaces=NS)
            meta.publisher = pub[0].strip() if pub else None

            # Date
            date = p.xpath("dc:date/text()", namespaces=NS)
            meta.pub_date = date[0][:10] if date and date[0] != "Unknown" else None

            # Series (Calibre metadata)
            series = opf.xpath("/pkg:package/pkg:metadata/pkg:meta[@name='calibre:series']/@content", namespaces=NS)
            if series:
                meta.series = series[0]
            series_idx = opf.xpath("/pkg:package/pkg:metadata/pkg:meta[@name='calibre:series_index']/@content", namespaces=NS)
            if series_idx:
                try:
                    meta.series_number = float(series_idx[0])
                except ValueError:
                    pass

            # Identifiers
            for node in p.xpath("dc:identifier", namespaces=NS):
                val = (node.text or "").strip()
                attrs = list(node.attrib.values())
                if attrs and val:
                    scheme = attrs[-1].lower()
                    if "isbn" in scheme and val:
                        meta.isbn = val

            # Cover
            meta.cover_data, meta.cover_ext = _extract_cover(opf, zf, cover_dir)

    except Exception as e:
        log.warning("Cannot parse EPUB: %s", e)

    return meta


def _extract_cover(opf, zf: zipfile.ZipFile, cover_dir: str) -> tuple[bytes | None, str | None]:
    # Method 1: item with id="cover-image"
    for href in opf.xpath("/pkg:package/pkg:manifest/pkg:item[@id='cover-image']/@href", namespaces=NS):
        data, ext = _read_cover(zf, cover_dir, href)
        if data:
            return data, ext

    # Method 2: meta name="cover" → manifest item
    meta_cover = opf.xpath("/pkg:package/pkg:metadata/pkg:meta[@name='cover']/@content", namespaces=NS)
    if meta_cover:
        hrefs = opf.xpath(f"/pkg:package/pkg:manifest/pkg:item[@id='{meta_cover[0]}']/@href", namespaces=NS)
        for href in hrefs:
            data, ext = _read_cover(zf, cover_dir, href)
            if data:
                return data, ext

    # Method 3: properties="cover-image"
    for href in opf.xpath("/pkg:package/pkg:manifest/pkg:item[@properties='cover-image']/@href", namespaces=NS):
        data, ext = _read_cover(zf, cover_dir, href)
        if data:
            return data, ext

    return None, None


def _read_cover(zf: zipfile.ZipFile, cover_dir: str, href: str) -> tuple[bytes | None, str | None]:
    ext = os.path.splitext(href)[1].lower()
    if ext not in COVER_EXTENSIONS:
        return None, None
    path = os.path.join(cover_dir, href).replace("\\", "/")
    try:
        data = zf.read(path)
        ext_clean = ext.lstrip(".").replace("jpeg", "jpg")
        return data, ext_clean
    except KeyError:
        try:
            data = zf.read(href)
            ext_clean = ext.lstrip(".").replace("jpeg", "jpg")
            return data, ext_clean
        except KeyError:
            return None, None

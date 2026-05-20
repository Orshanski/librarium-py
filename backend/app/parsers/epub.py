import os
import zipfile
import logging
from lxml import etree
from .. import xml_safe
from . import ParsedMetadata, normalize_language

log = logging.getLogger(__name__)

NS = {
    "n": "urn:oasis:names:tc:opendocument:xmlns:container",
    "pkg": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
}

COVER_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def _load_opf(zf: zipfile.ZipFile) -> tuple[etree._Element, str]:
    """Возвращает (opf_tree, cover_dir). Читает META-INF/container.xml → opf_path → opf_tree.
    Исключения: KeyError / IndexError / etree.XMLSyntaxError — любая malformed EPUB уйдёт в caller."""
    container = xml_safe.fromstring(zf.read("META-INF/container.xml"))
    opf_path = container.xpath("n:rootfiles/n:rootfile/@full-path", namespaces=NS)[0]
    opf = xml_safe.fromstring(zf.read(opf_path))
    cover_dir = os.path.dirname(opf_path)
    return opf, cover_dir


def _extract_title(p: etree._Element) -> str:
    """dc:title text. Пустая строка если тег отсутствует."""
    title = p.xpath("dc:title/text()", namespaces=NS)
    return title[0].strip() if title else ""


def _extract_authors(p: etree._Element) -> list[str]:
    """dc:creator — каждый может быть '&'-разделённым (несколько авторов в одном теге)."""
    authors: list[str] = []
    for c in p.xpath("dc:creator/text()", namespaces=NS):
        for a in c.split("&"):
            a = a.strip()
            if a:
                authors.append(a)
    return authors


def _extract_language(p: etree._Element) -> str | None:
    """dc:language, нормализуется через normalize_language."""
    lang = p.xpath("dc:language/text()", namespaces=NS)
    return normalize_language(lang[0]) if lang else None


def _extract_description(p: etree._Element) -> str | None:
    """dc:description — первый match, stripped."""
    desc = p.xpath("dc:description/text()", namespaces=NS)
    return desc[0].strip() if desc else None


def _extract_genres(p: etree._Element) -> list[str]:
    """dc:subject — список непустых stripped значений."""
    subjects = p.xpath("dc:subject/text()", namespaces=NS)
    return [s.strip() for s in subjects if s.strip()]


def _extract_publisher(p: etree._Element) -> str | None:
    pub = p.xpath("dc:publisher/text()", namespaces=NS)
    return pub[0].strip() if pub else None


def _extract_pub_date(p: etree._Element) -> str | None:
    """dc:date — берутся первые 10 символов (YYYY-MM-DD), 'Unknown' → None."""
    date = p.xpath("dc:date/text()", namespaces=NS)
    if not date or date[0] == "Unknown":
        return None
    return date[0][:10]


def _extract_series(opf: etree._Element) -> tuple[str | None, float | None]:
    """Calibre meta: 'calibre:series' + 'calibre:series_index'. Series_index через float() с try/except ValueError."""
    series: str | None = None
    series_number: float | None = None
    series_nodes = opf.xpath(
        "/pkg:package/pkg:metadata/pkg:meta[@name='calibre:series']/@content",
        namespaces=NS,
    )
    if series_nodes:
        series = series_nodes[0]
    idx_nodes = opf.xpath(
        "/pkg:package/pkg:metadata/pkg:meta[@name='calibre:series_index']/@content",
        namespaces=NS,
    )
    if idx_nodes:
        try:
            series_number = float(idx_nodes[0])
        except ValueError:
            pass
    return series, series_number


def _extract_isbn(p: etree._Element) -> str | None:
    """dc:identifier с attribute, содержащим 'isbn' (case-insensitive). Возвращает последний match в порядке обхода."""
    matches: list[str] = []
    for node in p.xpath("dc:identifier", namespaces=NS):
        val = (node.text or "").strip()
        attrs = list(node.attrib.values())
        if attrs and val:
            scheme = attrs[-1].lower()
            if "isbn" in scheme:
                matches.append(val)
    return matches[-1] if matches else None


def _extract_cover(opf, zf: zipfile.ZipFile, cover_dir: str) -> tuple[bytes | None, str | None]:
    # Method 1: item with id="cover-image"
    for href in opf.xpath("/pkg:package/pkg:manifest/pkg:item[@id='cover-image']/@href", namespaces=NS):
        data, ext = _read_cover(zf, cover_dir, href)
        if data:
            return data, ext

    # Method 2: meta name="cover" → manifest item
    meta_cover = opf.xpath("/pkg:package/pkg:metadata/pkg:meta[@name='cover']/@content", namespaces=NS)
    if meta_cover:
        # Safe: iterate manifest items instead of injecting into XPath
        hrefs = [item.get("href") for item in opf.xpath("/pkg:package/pkg:manifest/pkg:item", namespaces=NS) if item.get("id") == meta_cover[0]]
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


def parse_epub(file_path: str) -> ParsedMetadata:
    meta = ParsedMetadata()
    try:
        with zipfile.ZipFile(file_path) as zf:
            opf, cover_dir = _load_opf(zf)
            p = opf.xpath("/pkg:package/pkg:metadata", namespaces=NS)[0]

            meta.title = _extract_title(p)
            meta.authors = _extract_authors(p)
            meta.language = _extract_language(p)
            meta.description = _extract_description(p)
            meta.genres = _extract_genres(p)
            meta.publisher = _extract_publisher(p)
            meta.pub_date = _extract_pub_date(p)
            meta.series, meta.series_number = _extract_series(opf)
            meta.isbn = _extract_isbn(p)
            meta.cover_data, meta.cover_ext = _extract_cover(opf, zf, cover_dir)
    except Exception as e:
        log.warning("Cannot parse EPUB: %s", e)
    return meta

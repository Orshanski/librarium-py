import base64
import logging
from lxml import etree
from . import ParsedMetadata, normalize_language

log = logging.getLogger(__name__)

NS = {
    "fb": "http://www.gribuser.ru/xml/fictionbook/2.0",
    "l": "http://www.w3.org/1999/xlink",
}


def parse_fb2(file_path: str) -> ParsedMetadata:
    with open(file_path, "rb") as f:
        raw = f.read()

    # lxml handles encoding declaration in XML itself
    tree = etree.fromstring(raw)
    meta = ParsedMetadata()

    # Title
    title = tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:book-title/text()", namespaces=NS)
    meta.title = str(title[0]) if title else ""

    # Authors
    for el in tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:author", namespaces=NS):
        first = el.xpath("fb:first-name/text()", namespaces=NS)
        middle = el.xpath("fb:middle-name/text()", namespaces=NS)
        last = el.xpath("fb:last-name/text()", namespaces=NS)
        nick = el.xpath("fb:nickname/text()", namespaces=NS)
        parts = [p[0] for p in (first, middle, last) if p]
        name = " ".join(parts) if parts else (nick[0] if nick else "")
        if name:
            meta.authors.append(name)

    # Series — check title-info first, then publish-info
    seq = tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:sequence", namespaces=NS)
    if not seq:
        seq = tree.xpath("/fb:FictionBook/fb:description/fb:publish-info/fb:sequence", namespaces=NS)
    if seq:
        meta.series = seq[0].get("name", "") or None
        num = seq[0].get("number", "")
        if num:
            try:
                meta.series_number = float(num)
            except ValueError:
                pass

    # Genres
    genres = tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:genre/text()", namespaces=NS)
    meta.genres = [g.strip() for g in genres if g.strip()]

    # Language
    lang = tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:lang/text()", namespaces=NS)
    meta.language = normalize_language(str(lang[0])) if lang else None

    # Annotation
    annotation = tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:annotation", namespaces=NS)
    if annotation:
        parts = []
        for p in annotation[0].iter():
            if p.text:
                parts.append(p.text.strip())
            if p.tail:
                parts.append(p.tail.strip())
        meta.description = "\n".join(filter(None, parts))

    # Publisher
    pub = tree.xpath("/fb:FictionBook/fb:description/fb:publish-info/fb:publisher/text()", namespaces=NS)
    meta.publisher = str(pub[0]) if pub else None

    # Date
    date = tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:date/@value", namespaces=NS)
    if date:
        meta.pub_date = str(date[0])
    else:
        year = tree.xpath("/fb:FictionBook/fb:description/fb:publish-info/fb:year/text()", namespaces=NS)
        if year:
            meta.pub_date = str(year[0])

    # ISBN
    isbn = tree.xpath("/fb:FictionBook/fb:description/fb:publish-info/fb:isbn/text()", namespaces=NS)
    if isbn:
        meta.isbn = str(isbn[0]).strip() or None

    # Cover
    try:
        coverpage = tree.xpath(
            "/fb:FictionBook/fb:description/fb:title-info/fb:coverpage/fb:image/@l:href", namespaces=NS
        )
        if coverpage:
            cover_id = coverpage[0].lstrip("#")
            # Find binary by iterating (safe from XPath injection)
            binary = [b for b in tree.xpath("//fb:binary", namespaces=NS) if b.get("id") == cover_id]
            if not binary:
                binary = [b for b in tree.xpath("//binary") if b.get("id") == cover_id]
            if binary and binary[0].text:
                content_type = binary[0].get("content-type", "image/jpeg")
                meta.cover_data = base64.b64decode(binary[0].text.strip())
                ext_map = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif"}
                meta.cover_ext = ext_map.get(content_type, "jpg")
    except Exception as e:
        log.warning("Cannot extract FB2 cover: %s", e)

    return meta

import base64
import logging
from lxml import etree  # pyright: ignore[reportAttributeAccessIssue]  # lxml stubs miss etree
from .. import xml_safe
from . import ParsedMetadata, normalize_language

log = logging.getLogger(__name__)

NS = {
    "fb": "http://www.gribuser.ru/xml/fictionbook/2.0",
    "l": "http://www.w3.org/1999/xlink",
}


def _read_fb2_tree(file_path: str) -> etree._Element:
    """Прочитать FB2-файл и распарсить XML. lxml сам учитывает encoding declaration.
    Исключения: OSError (FS-ошибки), etree.XMLSyntaxError (malformed XML) — пробрасываются наверх."""
    with open(file_path, "rb") as f:
        raw = f.read()
    return xml_safe.fromstring(raw)


def _extract_title(tree: etree._Element) -> str:
    """dc-book-title/text(). Пустая строка если отсутствует."""
    title = tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:book-title/text()", namespaces=NS)
    return str(title[0]) if title else ""


def _extract_authors(tree: etree._Element) -> list[str]:
    """Итерация по author-нодам title-info: склейка first+middle+last либо nickname. Пустые отбрасываются."""
    authors: list[str] = []
    for author_el in tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:author", namespaces=NS):
        first = author_el.xpath("fb:first-name/text()", namespaces=NS)
        middle = author_el.xpath("fb:middle-name/text()", namespaces=NS)
        last = author_el.xpath("fb:last-name/text()", namespaces=NS)
        nick = author_el.xpath("fb:nickname/text()", namespaces=NS)
        name_parts = [p[0] for p in (first, middle, last) if p]
        if name_parts:
            name = " ".join(name_parts)
        elif nick:
            name = nick[0]
        else:
            name = ""
        if name:
            authors.append(name)
    return authors


def _extract_series(tree: etree._Element) -> tuple[str | None, float | None]:
    """Calibre-подобная seq: title-info → publish-info fallback. Возвращает (name, number) или (None, None)."""
    seq = tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:sequence", namespaces=NS)
    if not seq:
        seq = tree.xpath("/fb:FictionBook/fb:description/fb:publish-info/fb:sequence", namespaces=NS)
    if not seq:
        return None, None
    series = seq[0].get("name", "") or None
    series_number: float | None = None
    num = seq[0].get("number", "")
    if num:
        try:
            series_number = float(num)
        except ValueError:
            pass
    return series, series_number


def _extract_genres(tree: etree._Element) -> list[str]:
    """dc-genre/text(). Список непустых stripped значений."""
    genres = tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:genre/text()", namespaces=NS)
    return [g.strip() for g in genres if g.strip()]


def _extract_language(tree: etree._Element) -> str | None:
    """dc-lang/text() через normalize_language."""
    lang = tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:lang/text()", namespaces=NS)
    return normalize_language(str(lang[0])) if lang else None


def _extract_annotation(tree: etree._Element) -> str | None:
    """annotation → итерация .iter() по всем наследникам, сбор text+tail, join через \\n. None если annotation отсутствует."""
    annotation = tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:annotation", namespaces=NS)
    if not annotation:
        return None
    text_parts: list[str] = []
    for p in annotation[0].iter():
        if p.text:
            text_parts.append(p.text.strip())
        if p.tail:
            text_parts.append(p.tail.strip())
    return "\n".join(filter(None, text_parts))


def _extract_publisher(tree: etree._Element) -> str | None:
    """publish-info/publisher/text()."""
    pub = tree.xpath("/fb:FictionBook/fb:description/fb:publish-info/fb:publisher/text()", namespaces=NS)
    return str(pub[0]) if pub else None


def _extract_pub_date(tree: etree._Element) -> str | None:
    """title-info/date@value → publish-info/year fallback. None если оба отсутствуют."""
    date = tree.xpath("/fb:FictionBook/fb:description/fb:title-info/fb:date/@value", namespaces=NS)
    if date:
        return str(date[0])
    year = tree.xpath("/fb:FictionBook/fb:description/fb:publish-info/fb:year/text()", namespaces=NS)
    return str(year[0]) if year else None


def _extract_isbn(tree: etree._Element) -> str | None:
    """publish-info/isbn/text().strip() or None."""
    isbn = tree.xpath("/fb:FictionBook/fb:description/fb:publish-info/fb:isbn/text()", namespaces=NS)
    if not isbn:
        return None
    return str(isbn[0]).strip() or None


def _extract_cover(tree: etree._Element) -> tuple[bytes | None, str | None]:
    """coverpage→binary lookup через href, ns+no-ns fallback, base64 decode, ext_map. Best-effort (весь блок в try/except)."""
    try:
        coverpage = tree.xpath(
            "/fb:FictionBook/fb:description/fb:title-info/fb:coverpage/fb:image/@l:href", namespaces=NS
        )
        if not coverpage:
            return None, None
        cover_id = coverpage[0].lstrip("#")
        binary = [b for b in tree.xpath("//fb:binary", namespaces=NS) if b.get("id") == cover_id]
        if not binary:
            binary = [b for b in tree.xpath("//binary") if b.get("id") == cover_id]
        if not binary or not binary[0].text:
            return None, None
        content_type = binary[0].get("content-type", "image/jpeg")
        data = base64.b64decode(binary[0].text.strip())
        ext_map = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif"}
        return data, ext_map.get(content_type, "jpg")
    except Exception as e:
        log.warning("Cannot extract FB2 cover: %s", e)
        return None, None


def parse_fb2(file_path: str) -> ParsedMetadata:
    tree = _read_fb2_tree(file_path)
    meta = ParsedMetadata()
    meta.title = _extract_title(tree)
    meta.authors = _extract_authors(tree)
    meta.series, meta.series_number = _extract_series(tree)
    meta.genres = _extract_genres(tree)
    meta.language = _extract_language(tree)
    meta.description = _extract_annotation(tree)
    meta.publisher = _extract_publisher(tree)
    meta.pub_date = _extract_pub_date(tree)
    meta.isbn = _extract_isbn(tree)
    meta.cover_data, meta.cover_ext = _extract_cover(tree)
    return meta

import re
import logging
from . import ParsedMetadata

log = logging.getLogger(__name__)


def parse_pdf(file_path: str) -> ParsedMetadata:
    meta = ParsedMetadata()
    try:
        with open(file_path, "rb") as f:
            # Read first 4KB — Info dictionary is usually near the beginning
            head = f.read(4096)
            # Also check end of file
            f.seek(-min(4096, f.seek(0, 2)), 2)
            tail = f.read()
            raw = head + tail

        text = raw.decode("latin-1", errors="ignore")

        title = re.search(r"/Title\s*\(([^)]+)\)", text)
        if title:
            meta.title = _decode_pdf_string(title.group(1))

        author = re.search(r"/Author\s*\(([^)]+)\)", text)
        if author:
            meta.authors = [_decode_pdf_string(author.group(1))]

    except Exception as e:
        log.warning("Cannot parse PDF: %s", e)

    if not meta.title:
        # Fallback: filename
        name = file_path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
        meta.title = name

    return meta


def _decode_pdf_string(s: str) -> str:
    # Handle PDF octal escapes like \320\237
    def replace_octal(m):
        return chr(int(m.group(1), 8))

    decoded = re.sub(r"\\(\d{3})", replace_octal, s)
    # Try to decode as UTF-8 bytes
    try:
        raw = bytes(ord(c) for c in decoded)
        return raw.decode("utf-8")
    except (UnicodeDecodeError, ValueError):
        return decoded

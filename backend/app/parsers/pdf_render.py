import logging
import fitz  # PyMuPDF

log = logging.getLogger(__name__)


def render_cover(pdf_path: str, zoom: float = 1.5) -> tuple[bytes | None, str | None]:
    """Render first non-blank page as JPEG cover.

    Returns (jpeg_bytes, 'jpg') or (None, None) on failure.
    """
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        log.warning("Cannot open PDF for cover render: %s", e)
        return None, None

    try:
        matrix = fitz.Matrix(zoom, zoom)
        for pno in range(min(3, len(doc))):
            page = doc[pno]
            pix = page.get_pixmap(matrix=matrix)
            # Skip blank pages (very few unique colors)
            try:
                if pix.color_count() < 5:
                    continue
            except Exception:
                pass  # color_count may not be available on all builds
            jpeg_bytes = pix.tobytes("jpeg", jpg_quality=85)
            return jpeg_bytes, "jpg"
        return None, None
    finally:
        doc.close()

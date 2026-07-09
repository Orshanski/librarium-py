import logging
from typing import Any, cast

from ..logging_utils import safe as safe_log

log = logging.getLogger(__name__)

# Render parameters (empirical)
COVER_ZOOM = 1.5              # ~140 DPI for A4 — balance between quality and size
MAX_COVER_PAGES_TO_TRY = 3    # skip blank/title pages, try up to N first pages
MIN_COVER_COLORS = 5          # heuristic for "blank page" — <5 unique colors = skip


def render_cover(pdf_path: str, zoom: float = COVER_ZOOM) -> tuple[bytes | None, str | None]:
    """Render first non-blank page as JPEG cover.

    Returns (jpeg_bytes, 'jpg') or (None, None) on failure.
    Never raises — individual page errors are logged and skipped.
    PyMuPDF is imported lazily so absent dependency degrades to (None, None)
    instead of breaking the whole parser module at import time.
    """
    try:
        import fitz  # PyMuPDF (lazy import)
    except ImportError as e:
        log.warning("PyMuPDF not installed, cannot render cover: %s", safe_log(e))
        return None, None

    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        log.warning("Cannot open PDF for cover render: %s", safe_log(e))
        return None, None

    try:
        matrix = fitz.Matrix(zoom, zoom)
        for pno in range(min(MAX_COVER_PAGES_TO_TRY, len(doc))):
            try:
                page = doc[pno]
                pix = page.get_pixmap(matrix=matrix)
                # Skip blank pages (very few unique colors)
                try:
                    if cast(Any, pix.color_count()) < MIN_COVER_COLORS:
                        continue
                except Exception:
                    pass  # color_count may not be available on all builds
                jpeg_bytes = pix.tobytes("jpeg", jpg_quality=85)
                return jpeg_bytes, "jpg"
            except Exception as e:
                log.warning(
                    "Render failed at page %d of %s: %s",
                    int(pno), safe_log(str(pdf_path)), safe_log(e),
                )
                continue
        return None, None
    finally:
        doc.close()

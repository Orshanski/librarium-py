"""PDF linearization helper (Fast Web View).

Linearized PDFs let PDF.js start rendering the first page before the whole file
is fetched — important when reading over a slow network. We linearize at upload
time so every PDF served from the library is already fast-loading.
"""
import logging
import os
import tempfile

import pikepdf

from .logging_utils import safe as safe_log

log = logging.getLogger(__name__)


def linearize_pdf_in_place(path: str) -> bool:
    """Linearize PDF at `path` in place.

    Returns True if the file was rewritten, False otherwise (already linearized,
    invalid PDF, missing file, or any other failure). Never raises — a failed
    linearize should not block upload.
    """
    if not os.path.isfile(path):
        return False
    try:
        with pikepdf.open(path) as pdf:
            if pdf.is_linearized:
                return False
        # Write to a sibling temp file, then atomically replace.
        # pikepdf cannot linearize in place (reads and writes the same file).
        dir_name = os.path.dirname(path) or "."
        with tempfile.NamedTemporaryFile(
            dir=dir_name, prefix=".linear-", suffix=".pdf", delete=False
        ) as tmp:
            tmp_path = tmp.name
        try:
            with pikepdf.open(path) as pdf:
                pdf.save(tmp_path, linearize=True)
            os.replace(tmp_path, path)
            return True
        except Exception:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            raise
    except Exception as e:
        log.warning("Failed to linearize %s: %s", safe_log(path), safe_log(e))
        return False

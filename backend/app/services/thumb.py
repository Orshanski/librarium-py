import logging
import os

from ..config import DATA_DIR

log = logging.getLogger("librarium.services.thumb")

THUMBS_DIR = DATA_DIR / "thumbs"
THUMBS_DIR.mkdir(exist_ok=True)


def invalidate(book_id: int) -> None:
    """Delete cached thumbnail for a book."""
    thumb = str(THUMBS_DIR / f"{book_id}.jpg")
    if os.path.exists(thumb):
        os.remove(thumb)

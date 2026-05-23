import logging
import os

from .. import storage_paths

log = logging.getLogger("librarium.services.thumb")


def invalidate(book_id: int) -> None:
    """Delete cached thumbnail for a book."""
    thumb = storage_paths.thumb_file(book_id)
    if os.path.exists(thumb):
        os.remove(thumb)

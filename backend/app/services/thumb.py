import logging
import os

from .. import storage_paths
from ..exceptions import BadInputError
from ..logging_utils import safe as safe_log

log = logging.getLogger("librarium.services.thumb")


def invalidate(book_id: int) -> None:
    """Delete cached thumbnail for a book."""
    try:
        thumb = storage_paths.thumb_file(book_id)
        if os.path.exists(thumb):
            os.remove(thumb)
    except (BadInputError, OSError) as e:
        log.warning("Failed to invalidate thumbnail for book=%d: %s", book_id, safe_log(e))

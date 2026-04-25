"""Similar books via Litres (unofficial) — graceful degradation on upstream errors."""
import logging
import sqlite3

from ..dal import books as books_dal
from ..dal import similar as similar_dal
from ..dtos.similar import SimilarResponse
from ..exceptions import BadInputError, ForbiddenError, NotFoundError, UpstreamError
from ..providers.litres import fetch_similar, find_litres_id

log = logging.getLogger("librarium.services.similar")

_SOURCE = "litres"


def get_similar(db: sqlite3.Connection, book_id: int) -> SimilarResponse:
    book = books_dal.get_book_by_id(db, book_id)
    if not book:
        raise NotFoundError("Not found")

    title = book["title"]
    author_refs = book.get("authors") or []
    first_author = author_refs[0].name if author_refs else ""
    query = f"{title} {first_author}".strip()

    try:
        litres_id = find_litres_id(query, title)
        if not litres_id:
            return SimilarResponse(books=[], source=_SOURCE, error=None)
        similar = fetch_similar(litres_id)
        similar = similar_dal.exclude_owned(db, similar)
        return SimilarResponse(books=similar, source=_SOURCE, error=None)
    except (BadInputError, ForbiddenError, NotFoundError, UpstreamError):
        # Domain exceptions propagate to middleware — они означают validation/auth/
        # upstream failure с конкретной семантикой, не "temporary network blip".
        # Graceful-degrade только для того, чтобы не ронять UI на сетевых сбоях и
        # unknown-ошибках провайдера. Сейчас providers/litres.py raise'ит только
        # ConnectionError; но этот guard нужен как forward-protection — любая
        # будущая validation в провайдере (например InputError на bad query)
        # должна пройти наверх, а не превратиться в ложный "service_unavailable".
        raise
    except Exception as e:
        # Third-party/network errors — graceful degrade (UX decision, legacy).
        log.warning("Similar books error for book_id=%d: %s", book_id, e)
        return SimilarResponse(books=[], source=_SOURCE, error="service_unavailable")

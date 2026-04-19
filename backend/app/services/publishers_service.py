"""Publishers listing."""
import sqlite3

from ..dal import books as dal
from ..dtos.publishers import PublishersResponse


def list_publishers(db: sqlite3.Connection) -> PublishersResponse:
    return PublishersResponse(publishers=dal.get_all_publishers(db))

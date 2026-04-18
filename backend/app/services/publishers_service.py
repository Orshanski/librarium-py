"""Publishers listing."""
import sqlite3

from ..dal import books as dal


def list_publishers(db: sqlite3.Connection) -> list[dict]:
    return dal.get_all_publishers(db)

"""DB helpers for direct inspection in tests."""
import os
import sqlite3
from pathlib import Path


def connect_test_db() -> sqlite3.Connection:
    """Open a fresh SQLite connection to the test database."""
    data_dir = os.environ.get("DATA_DIR")
    if not data_dir:
        raise RuntimeError("DATA_DIR env is not set — is conftest loaded?")
    db_path = Path(data_dir) / "db.sqlite"
    if not db_path.exists():
        raise RuntimeError(f"Test DB not found at {db_path}")
    db = sqlite3.connect(str(db_path))
    db.row_factory = sqlite3.Row
    return db


def count_rows(db: sqlite3.Connection, table: str, where: str = "",
               params: tuple = ()) -> int:
    sql = f"SELECT COUNT(*) as c FROM {table}"
    if where:
        sql += f" WHERE {where}"
    return db.execute(sql, params).fetchone()["c"]


def fetch_one(db: sqlite3.Connection, sql: str,
              params: tuple = ()) -> sqlite3.Row | None:
    return db.execute(sql, params).fetchone()


def fetch_all(db: sqlite3.Connection, sql: str,
              params: tuple = ()) -> list[sqlite3.Row]:
    return db.execute(sql, params).fetchall()


def row_exists(db: sqlite3.Connection, table: str, where: str,
               params: tuple) -> bool:
    sql = f"SELECT 1 FROM {table} WHERE {where} LIMIT 1"
    return db.execute(sql, params).fetchone() is not None

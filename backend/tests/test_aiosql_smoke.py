"""Smoke: aiosql API contract, на который опирается эпик jnnb."""
import sqlite3
from pathlib import Path

import aiosql


def _make_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript("""
        CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);
        INSERT INTO items (id, name) VALUES (1, 'alpha'), (2, 'beta');
    """)
    return conn


def test_from_path_file_list_query_returns_sqlite3_row(tmp_path: Path):
    sql = tmp_path / "queries.sql"
    sql.write_text("-- name: list_items()\nSELECT id, name FROM items;\n")
    queries = aiosql.from_path(sql, "sqlite3")
    conn = _make_conn()
    rows = list(queries.list_items(conn))  # v15: list-query возвращает generator
    assert len(rows) == 2
    assert isinstance(rows[0], sqlite3.Row)
    assert rows[0]["name"] == "alpha"


def test_from_path_directory_loads_multiple_files(tmp_path: Path):
    d = tmp_path / "q"
    d.mkdir()
    (d / "list_items.sql").write_text("-- name: list_items()\nSELECT id, name FROM items;\n")
    (d / "count_items.sql").write_text("-- name: count_items()^\nSELECT COUNT(*) AS cnt FROM items;\n")
    queries = aiosql.from_path(d, "sqlite3")
    conn = _make_conn()
    assert queries.count_items(conn)["cnt"] == 2
    assert len(list(queries.list_items(conn))) == 2


def test_single_row_marker_returns_row_or_none(tmp_path: Path):
    sql = tmp_path / "q.sql"
    sql.write_text("-- name: get_item(id)^\nSELECT id, name FROM items WHERE id = :id;\n")
    queries = aiosql.from_path(sql, "sqlite3")
    conn = _make_conn()
    row = queries.get_item(conn, id=1)
    assert isinstance(row, sqlite3.Row)
    assert row["name"] == "alpha"
    assert queries.get_item(conn, id=999) is None


def test_bang_marker_returns_rowcount(tmp_path: Path):
    sql = tmp_path / "q.sql"
    sql.write_text("-- name: del_item(id)!\nDELETE FROM items WHERE id = :id;\n")
    queries = aiosql.from_path(sql, "sqlite3")
    conn = _make_conn()
    rowcount = queries.del_item(conn, id=1)
    assert rowcount == 1
    assert queries.del_item(conn, id=999) == 0


def test_insert_return_marker_returns_lastrowid(tmp_path: Path):
    sql = tmp_path / "q.sql"
    sql.write_text("-- name: add_item(name)<!\nINSERT INTO items (name) VALUES (:name);\n")
    queries = aiosql.from_path(sql, "sqlite3")
    conn = _make_conn()
    new_id = queries.add_item(conn, name="gamma")
    assert new_id == 3


def test_query_sql_attribute_is_public(tmp_path: Path):
    sql = tmp_path / "q.sql"
    sql.write_text("-- name: tpl()\nSELECT 1 AS n;\n")
    queries = aiosql.from_path(sql, "sqlite3")
    # План опирается на queries.<name>.sql (§Динамические фрагменты).
    assert "SELECT 1 AS n" in queries.tpl.sql

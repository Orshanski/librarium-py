"""Unit tests for db helpers.

Uses the test baseline which exists after conftest session-autouse fixture.
"""
import pytest

from tests._helpers.db import (
    connect_test_db,
    count_rows,
    fetch_one,
    fetch_all,
    row_exists,
)


def test_connect_returns_connection():
    db = connect_test_db()
    try:
        row = db.execute("SELECT 1 as x").fetchone()
        assert row["x"] == 1
    finally:
        db.close()


def test_count_rows_baseline_users():
    db = connect_test_db()
    try:
        # seed: admin + reader = 2
        assert count_rows(db, "users") == 2
    finally:
        db.close()


def test_count_rows_with_where():
    db = connect_test_db()
    try:
        assert count_rows(db, "users", where="role = ?", params=("admin",)) == 1
        assert count_rows(db, "users", where="role = ?", params=("reader",)) == 1
    finally:
        db.close()


def test_fetch_one_returns_row():
    db = connect_test_db()
    try:
        row = fetch_one(db, "SELECT id, title FROM books WHERE id = ?", (1,))
        assert row is not None
        assert row["id"] == 1
        assert row["title"] == "Minimal Test Book"
    finally:
        db.close()


def test_fetch_one_none_when_missing():
    db = connect_test_db()
    try:
        row = fetch_one(db, "SELECT id FROM books WHERE id = ?", (9999,))
        assert row is None
    finally:
        db.close()


def test_fetch_all_returns_rows():
    db = connect_test_db()
    try:
        rows = fetch_all(db, "SELECT id FROM books ORDER BY id")
        assert [r["id"] for r in rows] == [1, 2, 3, 4, 5]
    finally:
        db.close()


def test_row_exists_true_false():
    db = connect_test_db()
    try:
        assert row_exists(db, "books", where="id = ?", params=(1,)) is True
        assert row_exists(db, "books", where="id = ?", params=(9999,)) is False
    finally:
        db.close()

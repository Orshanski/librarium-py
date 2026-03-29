"""Собирает .test-data-baseline/ с seeded dataset."""
import base64
import os
import shutil
import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
BASELINE_DIR = PROJECT_ROOT / ".test-data-baseline"
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "books"

# Минимальный 1x1 JPEG для cover
TINY_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0o"
    "OjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2f/2wBDARESEhgVGC8a"
    "GC9nQTtBZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2f/"
    "wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAA"
    "AAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/a"
    "AAwDAQACEQMRAD8AAAH/2Q=="
)


def seed_baseline():
    if BASELINE_DIR.exists():
        shutil.rmtree(BASELINE_DIR)

    # Директории
    (BASELINE_DIR / "library").mkdir(parents=True)
    (BASELINE_DIR / "uploads").mkdir()
    (BASELINE_DIR / "thumbs").mkdir()

    # Secret key
    import secrets
    (BASELINE_DIR / ".secret_key").write_text(secrets.token_hex(32))

    # БД
    db_path = BASELINE_DIR / "db.sqlite"
    db = sqlite3.connect(str(db_path))
    db.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))

    # --- Пользователи ---
    import bcrypt
    admin_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()
    reader_hash = bcrypt.hashpw(b"reader123", bcrypt.gensalt()).decode()
    db.execute(
        "INSERT INTO users (id, username, password_hash, role, display_name, email) VALUES (1, 'admin', ?, 'admin', 'Test Admin', 'admin@test.com')",
        (admin_hash,),
    )
    db.execute(
        "INSERT INTO users (id, username, password_hash, role, display_name) VALUES (2, 'reader', ?, 'reader', 'Test Reader')",
        (reader_hash,),
    )

    # --- Справочники ---
    db.execute("INSERT INTO series (id, name, sort_name) VALUES (1, 'Test Series', 'Test Series')")
    db.execute("INSERT INTO series (id, name, sort_name) VALUES (2, 'Tset Series', 'Tset Series')")
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (1, 'Test Author', 'Author, Test')")
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (2, 'Cover Writer', 'Writer, Cover')")
    db.execute("INSERT INTO authors (id, name, sort_name) VALUES (3, 'Test Autor', 'Autor, Test')")
    db.execute("INSERT INTO tags (id, name) VALUES (1, 'Фэнтези')")
    db.execute("INSERT INTO tags (id, name) VALUES (2, 'Классический детектив')")

    # --- Книга 1: minimal.fb2 ---
    book1_dir = BASELINE_DIR / "library" / "1"
    book1_dir.mkdir()
    shutil.copy(FIXTURES_DIR / "minimal.fb2", book1_dir / "book.fb2")
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, publisher, pub_date, series_id, series_number, added_at) VALUES (1, 'Minimal Test Book', 'Minimal Test Book', 'ru', 'Test Publisher', '2025', 1, 1, '2025-01-01 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (1, 1)")
    db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (1, 1)")
    db.execute(
        "INSERT INTO book_files (book_id, format, file_path, file_size) VALUES (1, 'FB2', 'data/library/1/book.fb2', ?)",
        (os.path.getsize(book1_dir / "book.fb2"),),
    )
    db.execute("INSERT INTO book_identifiers (book_id, type, value) VALUES (1, 'isbn', '978-0-000-00001-0')")

    # --- Книга 2: with-cover.fb2 + cover.jpg ---
    book2_dir = BASELINE_DIR / "library" / "2"
    book2_dir.mkdir()
    shutil.copy(FIXTURES_DIR / "with-cover.fb2", book2_dir / "book.fb2")
    (book2_dir / "cover.jpg").write_bytes(TINY_JPEG)
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, publisher, pub_date, cover_path, added_at) VALUES (2, 'Book With Cover', 'Book With Cover', 'en', 'Cover Press', '2024', 'data/library/2/cover.jpg', '2025-01-02 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (2, 2)")
    db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (2, 2)")
    db.execute(
        "INSERT INTO book_files (book_id, format, file_path, file_size) VALUES (2, 'FB2', 'data/library/2/book.fb2', ?)",
        (os.path.getsize(book2_dir / "book.fb2"),),
    )
    db.execute("INSERT INTO book_identifiers (book_id, type, value) VALUES (2, 'isbn', '978-0-000-00002-0')")

    # --- Книга 3: English Fantasy (no file on disk) ---
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, series_id, series_number, added_at) VALUES (3, 'English Fantasy', 'English Fantasy', 'en', 1, 2, '2025-01-03 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (3, 1)")
    db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (3, 1)")

    # --- Книга 4: Русский Детектив (no file on disk) ---
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, series_id, series_number, added_at) VALUES (4, 'Русский Детектив', 'Русский Детектив', 'ru', 2, 1, '2025-01-04 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (4, 3)")
    db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (4, 2)")

    # --- Книга 5: Fantasy Detective (no file on disk, two tags) ---
    db.execute(
        "INSERT INTO books (id, title, sort_title, language, added_at) VALUES (5, 'Fantasy Detective', 'Fantasy Detective', 'en', '2025-01-05 00:00:00')"
    )
    db.execute("INSERT INTO book_authors (book_id, author_id) VALUES (5, 2)")
    db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (5, 1)")
    db.execute("INSERT INTO book_tags (book_id, tag_id) VALUES (5, 2)")

    # --- User data ---
    db.execute("INSERT INTO shelves (id, name, user_id, is_system) VALUES (1, 'Лучшее', 2, 1)")
    db.execute("INSERT INTO user_books (user_id, book_id, rating, is_read) VALUES (2, 1, 5, 1)")

    db.commit()
    db.close()

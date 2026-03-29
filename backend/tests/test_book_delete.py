import os
import sqlite3


def test_delete_book(admin_token):
    test_data = os.environ["DATA_DIR"]

    resp = admin_token.get("/api/books/1")
    assert resp.status_code == 200

    resp = admin_token.delete("/api/books/1")
    assert resp.status_code == 200

    resp = admin_token.get("/api/books/1")
    assert resp.status_code == 404

    assert not os.path.exists(os.path.join(test_data, "library", "1"))
    assert not os.path.exists(os.path.join(test_data, "thumbs", "1.jpg"))

    db = sqlite3.connect(os.path.join(test_data, "db.sqlite"))
    assert db.execute("SELECT COUNT(*) FROM book_authors WHERE book_id = 1").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM book_tags WHERE book_id = 1").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM book_files WHERE book_id = 1").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM book_identifiers WHERE book_id = 1").fetchone()[0] == 0
    db.close()


def test_reader_cannot_delete(reader_token):
    resp = reader_token.delete("/api/books/1")
    assert resp.status_code == 403

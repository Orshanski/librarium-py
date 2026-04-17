import os

from tests._helpers import assert_error, assert_ok, connect_test_db


def test_delete_book(admin_client):
    test_data = os.environ["DATA_DIR"]

    resp = admin_client.get("/api/books/1")
    assert_ok(resp)

    resp = admin_client.delete("/api/books/1")
    assert_ok(resp)

    resp = admin_client.get("/api/books/1")
    assert_error(resp, 404)

    assert not os.path.exists(os.path.join(test_data, "library", "1"))
    assert not os.path.exists(os.path.join(test_data, "thumbs", "1.jpg"))

    db = connect_test_db()
    try:
        assert db.execute("SELECT COUNT(*) FROM book_authors WHERE book_id = 1").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM book_tags WHERE book_id = 1").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM book_files WHERE book_id = 1").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM book_identifiers WHERE book_id = 1").fetchone()[0] == 0
    finally:
        db.close()


def test_reader_cannot_delete(reader_client):
    resp = reader_client.delete("/api/books/1")
    assert_error(resp, 403)

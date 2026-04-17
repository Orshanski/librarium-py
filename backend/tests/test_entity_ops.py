"""Entity operations: merge, rename, delete for authors and series."""
from tests._helpers import assert_error, assert_ok


def test_merge_author(admin_client):
    resp = admin_client.post("/api/authors/1/merge", json={"sourceId": 3})
    assert_ok(resp)

    assert_error(admin_client.get("/api/authors/3"), 404)


def test_self_merge_author_rejected(admin_client):
    assert_error(admin_client.post("/api/authors/1/merge", json={"sourceId": 1}), 400)


def test_merge_series(admin_client):
    resp = admin_client.post("/api/series/1/merge", json={"sourceId": 2})
    assert_ok(resp)

    assert_error(admin_client.get("/api/series/2"), 404)


def test_self_merge_series_rejected(admin_client):
    assert_error(admin_client.post("/api/series/1/merge", json={"sourceId": 1}), 400)


def test_rename_author(admin_client):
    resp = admin_client.put("/api/authors/1", json={"name": "Renamed Author"})
    assert_ok(resp)

    author = admin_client.get("/api/authors/1").json()
    assert author["author"]["name"] == "Renamed Author"


def test_rename_series(admin_client):
    resp = admin_client.put("/api/series/1", json={"name": "Renamed Series"})
    assert_ok(resp)

    series = admin_client.get("/api/series/1").json()
    assert series["series"]["name"] == "Renamed Series"


def test_reader_cannot_merge(reader_client):
    assert_error(
        reader_client.post("/api/authors/1/merge", json={"sourceId": 3}),
        403,
    )


# ── Delete ──


def test_delete_author_without_books(admin_client):
    """Автор без книг — удаляется."""
    # Author 3 (Test Autor) привязан только к книге 4. Отвяжем.
    admin_client.put("/api/books/4", json={"authorIds": [1]})

    resp = admin_client.delete("/api/authors/3")
    assert_ok(resp)

    assert_error(admin_client.get("/api/authors/3"), 404)


def test_delete_author_with_books(admin_client):
    """Автор с книгами — нельзя удалить."""
    resp = admin_client.delete("/api/authors/1")
    assert_error(resp, 400, message_matches="книгами")


def test_delete_author_nonexistent(admin_client):
    """Несуществующий автор — 404."""
    assert_error(admin_client.delete("/api/authors/999"), 404)


def test_delete_series_without_books(admin_client):
    """Серия без книг — удаляется."""
    # Series 2 (Tset Series) привязана только к книге 4. Отвяжем.
    admin_client.put("/api/books/4", json={"seriesId": None})

    resp = admin_client.delete("/api/series/2")
    assert_ok(resp)

    assert_error(admin_client.get("/api/series/2"), 404)


def test_delete_series_with_books(admin_client):
    """Серия с книгами — нельзя удалить."""
    resp = admin_client.delete("/api/series/1")
    assert_error(resp, 400, message_matches="книгами")


def test_reader_cannot_delete_author(reader_client):
    """Reader не может удалять авторов."""
    assert_error(reader_client.delete("/api/authors/3"), 403)


def test_reader_cannot_delete_series(reader_client):
    """Reader не может удалять серии."""
    assert_error(reader_client.delete("/api/series/2"), 403)

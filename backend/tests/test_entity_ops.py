def test_merge_author(admin_client):
    resp = admin_client.post("/api/authors/1/merge", json={"sourceId": 3})
    assert resp.status_code == 200

    resp = admin_client.get("/api/authors/3")
    assert resp.status_code == 404


def test_self_merge_author_rejected(admin_client):
    resp = admin_client.post("/api/authors/1/merge", json={"sourceId": 1})
    assert resp.status_code == 400


def test_merge_series(admin_client):
    resp = admin_client.post("/api/series/1/merge", json={"sourceId": 2})
    assert resp.status_code == 200

    resp = admin_client.get("/api/series/2")
    assert resp.status_code == 404


def test_self_merge_series_rejected(admin_client):
    resp = admin_client.post("/api/series/1/merge", json={"sourceId": 1})
    assert resp.status_code == 400


def test_rename_author(admin_client):
    resp = admin_client.put("/api/authors/1", json={"name": "Renamed Author"})
    assert resp.status_code == 200

    author = admin_client.get("/api/authors/1").json()
    assert author["author"]["name"] == "Renamed Author"


def test_rename_series(admin_client):
    resp = admin_client.put("/api/series/1", json={"name": "Renamed Series"})
    assert resp.status_code == 200

    series = admin_client.get("/api/series/1").json()
    assert series["series"]["name"] == "Renamed Series"


def test_reader_cannot_merge(reader_client):
    resp = reader_client.post("/api/authors/1/merge", json={"sourceId": 3})
    assert resp.status_code == 403


# ── Delete ──


def test_delete_author_without_books(admin_client):
    """Автор без книг — удаляется."""
    # Author 3 (Test Autor) привязан только к книге 4. Отвяжем.
    admin_client.put("/api/books/4", json={"authorIds": [1]})

    resp = admin_client.delete("/api/authors/3")
    assert resp.status_code == 200

    resp = admin_client.get("/api/authors/3")
    assert resp.status_code == 404


def test_delete_author_with_books(admin_client):
    """Автор с книгами — нельзя удалить."""
    resp = admin_client.delete("/api/authors/1")
    assert resp.status_code == 400
    assert "книгами" in resp.json()["error"]


def test_delete_author_nonexistent(admin_client):
    """Несуществующий автор — 404."""
    resp = admin_client.delete("/api/authors/999")
    assert resp.status_code == 404


def test_delete_series_without_books(admin_client):
    """Серия без книг — удаляется."""
    # Series 2 (Tset Series) привязана только к книге 4. Отвяжем.
    admin_client.put("/api/books/4", json={"seriesId": None})

    resp = admin_client.delete("/api/series/2")
    assert resp.status_code == 200

    resp = admin_client.get("/api/series/2")
    assert resp.status_code == 404


def test_delete_series_with_books(admin_client):
    """Серия с книгами — нельзя удалить."""
    resp = admin_client.delete("/api/series/1")
    assert resp.status_code == 400
    assert "книгами" in resp.json()["error"]


def test_reader_cannot_delete_author(reader_client):
    """Reader не может удалять авторов."""
    resp = reader_client.delete("/api/authors/3")
    assert resp.status_code == 403


def test_reader_cannot_delete_series(reader_client):
    """Reader не может удалять серии."""
    resp = reader_client.delete("/api/series/2")
    assert resp.status_code == 403

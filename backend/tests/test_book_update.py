"""Tests for PUT /api/books/{id} — metadata update."""


def get_book(client, book_id):
    return client.get(f"/api/books/{book_id}").json()["book"]


class TestBookUpdate:
    def test_update_title(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"title": "Updated Title"})
        assert resp.status_code == 200
        assert get_book(admin_client, 1)["title"] == "Updated Title"

    def test_update_description(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"description": "New description"})
        assert resp.status_code == 200
        assert get_book(admin_client, 1)["description"] == "New description"

    def test_update_language(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"language": "en"})
        assert resp.status_code == 200
        assert get_book(admin_client, 1)["language"] == "en"

    def test_update_publisher(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"publisher": "New Press"})
        assert resp.status_code == 200
        assert get_book(admin_client, 1)["publisher"] == "New Press"

    def test_update_author_ids(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"authorIds": [2, 3]})
        assert resp.status_code == 200
        book = get_book(admin_client, 1)
        assert "Cover Writer" in book["authors"]
        assert "Test Autor" in book["authors"]

    def test_update_author_by_name(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"authorIds": ["Brand New Author"]})
        assert resp.status_code == 200
        assert "Brand New Author" in get_book(admin_client, 1)["authors"]

    def test_update_tag_by_name(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"tagIds": ["Новый Жанр"]})
        assert resp.status_code == 200
        assert "Новый Жанр" in get_book(admin_client, 1)["tags"]

    def test_update_series_by_name(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"seriesId": "Brand New Series"})
        assert resp.status_code == 200
        assert get_book(admin_client, 1)["series_name"] == "Brand New Series"

    def test_partial_update(self, admin_client):
        original = get_book(admin_client, 1)
        admin_client.put("/api/books/1", json={"title": "Only Title Changed"})
        updated = get_book(admin_client, 1)
        assert updated["title"] == "Only Title Changed"
        assert updated["language"] == original["language"]
        assert updated["publisher"] == original["publisher"]

    def test_reader_cannot_update(self, reader_client):
        resp = reader_client.put("/api/books/1", json={"title": "Hacked"})
        assert resp.status_code == 403

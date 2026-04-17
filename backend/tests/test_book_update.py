"""Tests for PUT /api/books/{id} — metadata update."""
from tests._helpers import assert_error, assert_ok


def get_book(client, book_id):
    return client.get(f"/api/books/{book_id}").json()["book"]


class TestBookUpdate:
    def test_update_title(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"title": "Updated Title"})
        data = assert_ok(resp)
        assert get_book(admin_client, 1)["title"] == "Updated Title"

    def test_update_description(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"description": "New description"})
        data = assert_ok(resp)
        assert get_book(admin_client, 1)["description"] == "New description"

    def test_update_language(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"language": "en"})
        data = assert_ok(resp)
        assert get_book(admin_client, 1)["language"] == "en"

    def test_update_publisher(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"publisher": "New Press"})
        data = assert_ok(resp)
        assert get_book(admin_client, 1)["publisher"] == "New Press"

    def test_update_author_ids(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"authorIds": [2, 3]})
        data = assert_ok(resp)
        book = get_book(admin_client, 1)
        assert "Cover Writer" in book["authors"]
        assert "Test Autor" in book["authors"]

    def test_update_author_by_name(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"authorIds": ["Brand New Author"]})
        data = assert_ok(resp)
        assert "Brand New Author" in get_book(admin_client, 1)["authors"]

    def test_update_tag_ids_int(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"tagIds": [2]})
        data = assert_ok(resp)
        book = get_book(admin_client, 1)
        assert "Классический детектив" in book["tags"]
        assert "Фэнтези" not in book["tags"]

    def test_update_tag_by_name(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"tagIds": ["Новый Жанр"]})
        data = assert_ok(resp)
        assert "Новый Жанр" in get_book(admin_client, 1)["tags"]

    def test_update_series_by_name(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"seriesId": "Brand New Series"})
        data = assert_ok(resp)
        assert get_book(admin_client, 1)["series_name"] == "Brand New Series"

    def test_partial_update(self, admin_client):
        original = get_book(admin_client, 1)
        admin_client.put("/api/books/1", json={"title": "Only Title Changed"})
        updated = get_book(admin_client, 1)
        assert updated["title"] == "Only Title Changed"
        assert updated["language"] == original["language"]
        assert updated["publisher"] == original["publisher"]

    def test_update_isbn(self, admin_client):
        resp = admin_client.put("/api/books/1", json={"isbn": "978-3-16-148410-0"})
        data = assert_ok(resp)
        response_data = admin_client.get("/api/books/1").json()
        isbn_ids = [i for i in response_data["identifiers"] if i["type"] == "isbn"]
        assert len(isbn_ids) == 1
        assert isbn_ids[0]["value"] == "978-3-16-148410-0"

    def test_update_isbn_replace(self, admin_client):
        admin_client.put("/api/books/1", json={"isbn": "111"})
        admin_client.put("/api/books/1", json={"isbn": "222"})
        response_data = admin_client.get("/api/books/1").json()
        isbn_ids = [i for i in response_data["identifiers"] if i["type"] == "isbn"]
        assert len(isbn_ids) == 1
        assert isbn_ids[0]["value"] == "222"

    def test_update_isbn_clear(self, admin_client):
        admin_client.put("/api/books/1", json={"isbn": "999"})
        admin_client.put("/api/books/1", json={"isbn": ""})
        response_data = admin_client.get("/api/books/1").json()
        isbn_ids = [i for i in response_data["identifiers"] if i["type"] == "isbn"]
        assert len(isbn_ids) == 0

    def test_reader_cannot_update(self, reader_client):
        resp = reader_client.put("/api/books/1", json={"title": "Hacked"})
        assert_error(resp, 403)

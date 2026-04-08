"""Tests for shelves CRUD and user-book interactions (rating, read, hidden)."""


def book_ids(books):
    return {b["id"] for b in books}


def find_shelf_id(client, system_code: str) -> int:
    shelves = client.get("/api/shelves").json()["shelves"]
    return next(s["id"] for s in shelves if s.get("system_code") == system_code)


# ── Shelves CRUD ──

class TestShelvesCRUD:
    def test_create_shelf(self, reader_client):
        resp = reader_client.post("/api/shelves", json={"name": "Sci-Fi"})
        assert resp.status_code == 200
        assert "id" in resp.json()

    def test_list_contains_created_shelf(self, reader_client):
        create = reader_client.post("/api/shelves", json={"name": "Sci-Fi"})
        shelf_id = create.json()["id"]
        resp = reader_client.get("/api/shelves")
        names = {s["name"] for s in resp.json()["shelves"]}
        assert "Sci-Fi" in names

    def test_get_shelf_empty(self, reader_client):
        shelf_id = reader_client.post("/api/shelves", json={"name": "Sci-Fi"}).json()["id"]
        resp = reader_client.get(f"/api/shelves/{shelf_id}")
        assert resp.status_code == 200
        assert resp.json()["books"] == []

    def test_rename_shelf(self, reader_client):
        shelf_id = reader_client.post("/api/shelves", json={"name": "Sci-Fi"}).json()["id"]
        resp = reader_client.put(f"/api/shelves/{shelf_id}", json={"name": "Science Fiction"})
        assert resp.status_code == 200
        detail = reader_client.get(f"/api/shelves/{shelf_id}").json()
        assert detail["shelf"]["name"] == "Science Fiction"

    def test_add_book_to_shelf(self, reader_client):
        shelf_id = reader_client.post("/api/shelves", json={"name": "Sci-Fi"}).json()["id"]
        resp = reader_client.post(f"/api/shelves/{shelf_id}/books", json={"bookId": 1})
        assert resp.status_code == 200
        detail = reader_client.get(f"/api/shelves/{shelf_id}").json()
        assert book_ids(detail["books"]) == {1}

    def test_remove_book_from_shelf(self, reader_client):
        shelf_id = reader_client.post("/api/shelves", json={"name": "Sci-Fi"}).json()["id"]
        reader_client.post(f"/api/shelves/{shelf_id}/books", json={"bookId": 1})
        resp = reader_client.delete(f"/api/shelves/{shelf_id}/books/1")
        assert resp.status_code == 200
        detail = reader_client.get(f"/api/shelves/{shelf_id}").json()
        assert detail["books"] == []

    def test_delete_shelf(self, reader_client):
        shelf_id = reader_client.post("/api/shelves", json={"name": "Sci-Fi"}).json()["id"]
        resp = reader_client.delete(f"/api/shelves/{shelf_id}")
        assert resp.status_code == 200
        resp = reader_client.get(f"/api/shelves/{shelf_id}")
        assert resp.status_code == 404

    def test_book_shelves_query(self, reader_client):
        resp = reader_client.get("/api/shelves", params={"bookId": 1})
        assert resp.status_code == 200
        assert "bookShelves" in resp.json()

    def test_add_book_idempotent(self, reader_client):
        shelf_id = reader_client.post("/api/shelves", json={"name": "Sci-Fi"}).json()["id"]
        reader_client.post(f"/api/shelves/{shelf_id}/books", json={"bookId": 1})
        resp = reader_client.post(f"/api/shelves/{shelf_id}/books", json={"bookId": 1})
        assert resp.status_code == 200
        detail = reader_client.get(f"/api/shelves/{shelf_id}").json()
        assert len(detail["books"]) == 1


# ── System shelf "Лучшее" ──

class TestSystemShelf:
    def test_system_shelf_in_list(self, reader_client):
        resp = reader_client.get("/api/shelves")
        shelves = resp.json()["shelves"]
        system = [s for s in shelves if s["is_system"]]
        assert len(system) == 2
        best = [s for s in system if s["system_code"] == "best"]
        assert len(best) == 1
        assert best[0]["book_count"] == 1
        reading_now = [s for s in system if s["system_code"] == "reading_now"]
        assert len(reading_now) == 1

    def test_system_shelf_contains_rated_book(self, reader_client):
        sid = find_shelf_id(reader_client, "best")
        resp = reader_client.get(f"/api/shelves/{sid}")
        assert resp.status_code == 200
        assert book_ids(resp.json()["books"]) == {1}

    def test_system_shelf_not_deletable(self, reader_client):
        sid = find_shelf_id(reader_client, "best")
        resp = reader_client.delete(f"/api/shelves/{sid}")
        assert resp.status_code == 200
        resp = reader_client.get(f"/api/shelves/{sid}")
        assert resp.status_code == 200

    def test_system_shelf_dynamic(self, reader_client):
        sid = find_shelf_id(reader_client, "best")
        # Rate book 3 → appears in system shelf
        reader_client.put("/api/books/3/rating", json={"rating": 4})
        resp = reader_client.get(f"/api/shelves/{sid}")
        assert book_ids(resp.json()["books"]) == {1, 3}
        # Remove rating → disappears
        reader_client.put("/api/books/3/rating", json={"rating": None})
        resp = reader_client.get(f"/api/shelves/{sid}")
        assert book_ids(resp.json()["books"]) == {1}


class TestReadingNowShelf:
    def test_reading_now_shows_book_with_progress(self, reader_client):
        # Save reading progress for book 2
        reader_client.put("/api/reader/progress/2", json={
            "position": "epubcfi(/6/4!/4/2/1:0)",
            "last_device": "test",
            "last_format": "fb2",
            "fraction": 0.25,
        })
        sid = find_shelf_id(reader_client, "reading_now")
        resp = reader_client.get(f"/api/shelves/{sid}")
        books = resp.json()["books"]
        assert 2 in book_ids(books)
        b = next(b for b in books if b["id"] == 2)
        assert b["fraction"] == 0.25
        assert b["last_format"] == "fb2"

    def test_reading_now_excludes_read_book(self, reader_client):
        # Save progress for book 3
        reader_client.put("/api/reader/progress/3", json={
            "position": "epubcfi(/6/4!/4/2/1:0)",
            "last_device": "test",
            "last_format": "epub",
            "fraction": 0.5,
        })
        # Mark as read
        reader_client.put("/api/books/3/read", json={"isRead": True})
        sid = find_shelf_id(reader_client, "reading_now")
        resp = reader_client.get(f"/api/shelves/{sid}")
        assert 3 not in book_ids(resp.json()["books"])

    def test_reading_now_excludes_null_position(self, reader_client):
        sid = find_shelf_id(reader_client, "reading_now")
        resp = reader_client.get(f"/api/shelves/{sid}")
        # Book 4 has no progress at all — should not appear
        assert 4 not in book_ids(resp.json()["books"])


class TestBookShelvesQuery:
    def test_book_shelves_system_has_book_false(self, reader_client):
        resp = reader_client.get("/api/shelves", params={"bookId": 1})
        book_shelves = resp.json()["bookShelves"]
        best_id = find_shelf_id(reader_client, "best")
        system = [bs for bs in book_shelves if bs["id"] == best_id]
        assert len(system) == 1
        assert system[0]["has_book"] is False


# ── User books: rating, read, hidden ──

class TestUserBooks:
    def test_set_rating(self, reader_client):
        resp = reader_client.put("/api/books/3/rating", json={"rating": 4})
        assert resp.status_code == 200
        book = reader_client.get("/api/books/3").json()["book"]
        assert book["rating"] == 4

    def test_clear_rating(self, reader_client):
        reader_client.put("/api/books/3/rating", json={"rating": 4})
        resp = reader_client.put("/api/books/3/rating", json={"rating": None})
        assert resp.status_code == 200
        book = reader_client.get("/api/books/3").json()["book"]
        assert book["rating"] is None

    def test_rating_lower_bound(self, reader_client):
        resp = reader_client.put("/api/books/3/rating", json={"rating": 1})
        assert resp.status_code == 200
        book = reader_client.get("/api/books/3").json()["book"]
        assert book["rating"] == 1

    def test_rating_too_high(self, reader_client):
        resp = reader_client.put("/api/books/3/rating", json={"rating": 6})
        assert resp.status_code == 400

    def test_rating_too_low(self, reader_client):
        resp = reader_client.put("/api/books/3/rating", json={"rating": 0})
        assert resp.status_code == 400

    def test_set_read(self, reader_client):
        resp = reader_client.put("/api/books/3/read", json={"isRead": True})
        assert resp.status_code == 200
        book = reader_client.get("/api/books/3").json()["book"]
        assert book["is_read"] == 1

    def test_set_hidden(self, reader_client):
        resp = reader_client.put("/api/books/3/hidden", json={"isHidden": True})
        assert resp.status_code == 200
        from app.dal.user_books import get_user_book
        from app.database import _get_db
        db = _get_db()
        ub = get_user_book(db, 2, 3)  # reader user_id=2
        assert ub["is_hidden"] == 1

    def test_hidden_excludes_from_catalog(self, reader_client):
        reader_client.put("/api/books/3/hidden", json={"isHidden": True})
        resp = reader_client.get("/api/books")
        ids = {b["id"] for b in resp.json()["books"]}
        assert 3 not in ids

    def test_unhide_restores_to_catalog(self, reader_client):
        reader_client.put("/api/books/3/hidden", json={"isHidden": True})
        reader_client.put("/api/books/3/hidden", json={"isHidden": False})
        resp = reader_client.get("/api/books")
        ids = {b["id"] for b in resp.json()["books"]}
        assert 3 in ids


class TestBookResponseDefaults:
    """GET /api/books/{id} returns sensible defaults for books with no user_books row."""

    def test_default_is_read_null(self, reader_client):
        book = reader_client.get("/api/books/3").json()["book"]
        assert book["is_read"] is None or book["is_read"] == 0

    def test_default_rating_null(self, reader_client):
        book = reader_client.get("/api/books/3").json()["book"]
        assert book["rating"] is None


class TestBookResponseIncludesUserData:
    """GET /api/books/{id} and GET /api/books should include is_read and rating."""

    def test_book_detail_has_is_read(self, reader_client):
        book = reader_client.get("/api/books/1").json()["book"]
        assert "is_read" in book

    def test_book_detail_reflects_read(self, reader_client):
        reader_client.put("/api/books/3/read", json={"isRead": True})
        book = reader_client.get("/api/books/3").json()["book"]
        assert book["is_read"] == 1

    def test_book_detail_has_rating(self, reader_client):
        reader_client.put("/api/books/3/rating", json={"rating": 4})
        book = reader_client.get("/api/books/3").json()["book"]
        assert book["rating"] == 4

    def test_catalog_has_is_read(self, reader_client):
        reader_client.put("/api/books/1/read", json={"isRead": True})
        data = reader_client.get("/api/books").json()
        book = next(b for b in data["books"] if b["id"] == 1)
        assert book["is_read"] == 1

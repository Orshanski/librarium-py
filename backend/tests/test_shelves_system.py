"""System shelves (best, reading_now, auto-created)."""
from tests._helpers import assert_ok


def book_ids(books):
    return {b["id"] for b in books}


def find_shelf_id(client, system_code: str) -> int:
    shelves = client.get("/api/shelves").json()["shelves"]
    return next(s["id"] for s in shelves if s.get("systemCode") == system_code)


def test_system_shelf_in_list(reader_client):
    resp = reader_client.get("/api/shelves")
    shelves = resp.json()["shelves"]
    system = [s for s in shelves if s["isSystem"]]
    assert len(system) == 2
    best = [s for s in system if s["systemCode"] == "best"]
    assert len(best) == 1
    assert best[0]["bookCount"] == 1
    reading_now = [s for s in system if s["systemCode"] == "reading_now"]
    assert len(reading_now) == 1


def test_system_shelf_contains_rated_book(reader_client):
    sid = find_shelf_id(reader_client, "best")
    resp = reader_client.get(f"/api/shelves/{sid}")
    data = assert_ok(resp)
    assert book_ids(data["books"]) == {1}


def test_system_shelf_not_deletable(reader_client):
    sid = find_shelf_id(reader_client, "best")
    resp = reader_client.delete(f"/api/shelves/{sid}")
    assert_ok(resp)
    resp = reader_client.get(f"/api/shelves/{sid}")
    assert_ok(resp)


def test_system_shelf_dynamic(reader_client):
    sid = find_shelf_id(reader_client, "best")
    # Rate book 3 → appears in system shelf
    reader_client.put("/api/books/3/rating", json={"rating": 4})
    resp = reader_client.get(f"/api/shelves/{sid}")
    assert book_ids(resp.json()["books"]) == {1, 3}
    # Remove rating → disappears
    reader_client.put("/api/books/3/rating", json={"rating": None})
    resp = reader_client.get(f"/api/shelves/{sid}")
    assert book_ids(resp.json()["books"]) == {1}


def test_reading_now_shows_book_with_progress(reader_client):
    # Save reading progress for book 2
    reader_client.put("/api/reader/progress/2", json={
        "position": "epubcfi(/6/4!/4/2/1:0)",
        "lastDevice": "test",
        "lastFormat": "fb2",
        "fraction": 0.25,
    })
    sid = find_shelf_id(reader_client, "reading_now")
    resp = reader_client.get(f"/api/shelves/{sid}")
    books = resp.json()["books"]
    # Book with saved progress must appear on reading_now shelf.
    # Reading progress fields (fraction, lastFormat, lastReadAt) are NOT
    # part of BookCardItem; they will arrive via a dedicated progressByBookId
    # section in Phase 4.5.
    assert 2 in book_ids(books)


def test_reading_now_excludes_read_book(reader_client):
    # Save progress for book 3
    reader_client.put("/api/reader/progress/3", json={
        "position": "epubcfi(/6/4!/4/2/1:0)",
        "lastDevice": "test",
        "lastFormat": "epub",
        "fraction": 0.5,
    })
    # Mark as read
    reader_client.put("/api/books/3/read", json={"isRead": True})
    sid = find_shelf_id(reader_client, "reading_now")
    resp = reader_client.get(f"/api/shelves/{sid}")
    assert 3 not in book_ids(resp.json()["books"])


def test_reading_now_excludes_null_position(reader_client):
    sid = find_shelf_id(reader_client, "reading_now")
    resp = reader_client.get(f"/api/shelves/{sid}")
    # Book 4 has no progress at all — should not appear
    assert 4 not in book_ids(resp.json()["books"])


def test_book_shelves_system_has_book_false(reader_client):
    resp = reader_client.get("/api/shelves", params={"bookId": 1})
    book_shelves = resp.json()["bookShelves"]
    best_id = find_shelf_id(reader_client, "best")
    system = [bs for bs in book_shelves if bs["id"] == best_id]
    assert len(system) == 1
    assert system[0]["hasBook"] is False

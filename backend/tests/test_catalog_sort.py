"""Sort order assertions for GET /api/books."""


def test_sort_title_asc(reader_client):
    data = reader_client.get("/api/books", params={"sort": "title_asc"}).json()
    titles = [b["title"] for b in data["books"]]
    expected = ["Book With Cover", "English Fantasy", "Fantasy Detective", "Minimal Test Book", "Русский Детектив"]
    assert titles == expected


def test_sort_title_desc(reader_client):
    data = reader_client.get("/api/books", params={"sort": "title_desc"}).json()
    titles = [b["title"] for b in data["books"]]
    expected = ["Русский Детектив", "Minimal Test Book", "Fantasy Detective", "English Fantasy", "Book With Cover"]
    assert titles == expected


def test_sort_added_desc(reader_client):
    data = reader_client.get("/api/books", params={"sort": "added_desc"}).json()
    assert data["books"][0]["id"] == 5

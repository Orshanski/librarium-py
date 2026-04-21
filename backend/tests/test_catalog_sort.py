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


def test_sort_added_asc(reader_client):
    data = reader_client.get("/api/books", params={"sort": "added_asc"}).json()
    ids = [b["id"] for b in data["books"]]
    # added_at ascending: 1 (Jan 1), 2 (Jan 2), 3 (Jan 3), 4 (Jan 4), 5 (Jan 5)
    assert ids == [1, 2, 3, 4, 5]


def test_sort_author_desc(reader_client):
    data = reader_client.get("/api/books", params={"sort": "author_desc"}).json()
    titles = [b["title"] for b in data["books"]]
    # MIN(sort_name) DESC: "Writer, Cover" > "Autor, Test" > "Author, Test"
    # "Writer, Cover": books 2 "Book With Cover", 5 "Fantasy Detective" (title asc)
    # "Autor, Test": book 4 "Русский Детектив"
    # "Author, Test": books 3 "English Fantasy", 1 "Minimal Test Book" (title asc)
    expected = [
        "Book With Cover",
        "Fantasy Detective",
        "Русский Детектив",
        "English Fantasy",
        "Minimal Test Book",
    ]
    assert titles == expected


def test_sort_rating_asc(reader_client):
    data = reader_client.get("/api/books", params={"sort": "rating_asc"}).json()
    ids = [b["id"] for b in data["books"]]
    # rating ASC NULLS LAST: book 1 (rating=5) first, then nulls added_at DESC: 5,4,3,2
    assert ids == [1, 5, 4, 3, 2]

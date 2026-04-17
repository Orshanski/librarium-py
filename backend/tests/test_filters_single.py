"""Single-dimension filters on GET /api/books."""


def book_ids(resp_json):
    return {b["id"] for b in resp_json["books"]}


class TestBooksFilters:
    def test_no_filters(self, reader_client):
        data = reader_client.get("/api/books").json()
        assert len(data["books"]) == 5

    def test_filter_by_author(self, reader_client):
        data = reader_client.get("/api/books", params={"authorIds": "1"}).json()
        assert book_ids(data) == {1, 3}

    def test_filter_by_tag(self, reader_client):
        data = reader_client.get("/api/books", params={"tagIds": "1"}).json()
        assert book_ids(data) == {1, 3, 5}

    def test_filter_by_series(self, reader_client):
        data = reader_client.get("/api/books", params={"seriesIds": "1"}).json()
        assert book_ids(data) == {1, 3}

    def test_filter_by_language(self, reader_client):
        data = reader_client.get("/api/books", params={"language": "ru"}).json()
        assert book_ids(data) == {1, 4}

    def test_filter_nonexistent_author(self, reader_client):
        data = reader_client.get("/api/books", params={"authorIds": "999"}).json()
        assert len(data["books"]) == 0

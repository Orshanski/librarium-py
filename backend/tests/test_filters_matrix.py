"""Pairwise, triple, and empty-result filter combinations."""


def _ids(data):
    return {b["id"] for b in data["books"]}


class TestFilterPairwise:
    def test_author_and_tag(self, reader_client):
        data = reader_client.get("/api/books",
                                 params={"authorIds": "1", "tagIds": "1"}).json()
        assert _ids(data) == {1, 3}

    def test_author_and_series(self, reader_client):
        # baseline: author 1 + series 1 = {1, 3}
        data = reader_client.get("/api/books",
                                 params={"authorIds": "1", "seriesIds": "1"}).json()
        assert _ids(data) == {1, 3}

    def test_tag_and_series(self, reader_client):
        data = reader_client.get("/api/books",
                                 params={"tagIds": "1", "seriesIds": "1"}).json()
        assert _ids(data) == {1, 3}

    def test_tag_and_language(self, reader_client):
        data = reader_client.get("/api/books",
                                 params={"tagIds": "2", "language": "ru"}).json()
        assert _ids(data) == {4}

    def test_series_and_language(self, reader_client):
        data = reader_client.get("/api/books",
                                 params={"seriesIds": "1", "language": "en"}).json()
        assert _ids(data) == {3}

    def test_author_and_language(self, reader_client):
        data = reader_client.get("/api/books",
                                 params={"authorIds": "1", "language": "en"}).json()
        assert _ids(data) == {3}


class TestFilterTripleCombo:
    def test_author_tag_language(self, reader_client):
        data = reader_client.get(
            "/api/books",
            params={"authorIds": "1", "tagIds": "1", "language": "en"},
        ).json()
        assert _ids(data) == {3}


class TestFilterEmptyResult:
    def test_series_language_mismatch(self, reader_client):
        # series 2 = Russian books; language en → empty
        data = reader_client.get("/api/books",
                                 params={"seriesIds": "2", "language": "en"}).json()
        assert _ids(data) == set()

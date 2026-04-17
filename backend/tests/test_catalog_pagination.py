"""Pagination via pageSize + cursor for GET /api/books."""


def test_page_size_respected(reader_client):
    data = reader_client.get("/api/books", params={"pageSize": "2"}).json()
    assert len(data["books"]) == 2


def test_page_size_max_cap_is_100(reader_client):
    """Current code: pageSize = min(pageSize, 100)."""
    data = reader_client.get("/api/books", params={"pageSize": "9999"}).json()
    assert len(data["books"]) <= 100


def test_pagination_no_duplicates(reader_client):
    page1 = reader_client.get("/api/books",
                              params={"pageSize": "2", "sort": "added_asc"}).json()
    cursor = page1.get("nextCursor") or page1.get("cursor")
    if cursor is not None:
        page2 = reader_client.get("/api/books",
                                  params={"pageSize": "2", "cursor": cursor,
                                          "sort": "added_asc"}).json()
        ids_1 = {b["id"] for b in page1["books"]}
        ids_2 = {b["id"] for b in page2["books"]}
        assert ids_1.isdisjoint(ids_2)

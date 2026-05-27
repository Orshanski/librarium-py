import logging
from pathlib import Path

import pytest

from tests._helpers import assert_error, assert_ok, login_client


FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"
USER_SCOPED_BOOK_FIELDS = {"rating", "isRead", "is_read", "isHidden", "is_hidden", "hidden"}


def _row_exists(db, sql: str, params: tuple) -> bool:
    return db.execute(sql, params).fetchone() is not None


def _user_book_row_exists(db, *, user_id: int, book_id: int) -> bool:
    return _row_exists(
        db,
        "SELECT 1 FROM user_books WHERE user_id = ? AND book_id = ? LIMIT 1",
        (user_id, book_id),
    )


def _shelf_book_row_exists(db, *, shelf_id: int, book_id: int) -> bool:
    return _row_exists(
        db,
        "SELECT 1 FROM shelf_books WHERE shelf_id = ? AND book_id = ? LIMIT 1",
        (shelf_id, book_id),
    )


def _close_session(session):
    try:
        next(session)
    except StopIteration:
        return


def _upload_temp(client, filename: str) -> str:
    with open(FIXTURES / filename, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": (filename, f, "application/octet-stream")},
        )
    return assert_ok(response)["tempId"]


def _without_user_scoped_fields(book: dict) -> dict:
    return {
        key: value
        for key, value in book.items()
        if key not in USER_SCOPED_BOOK_FIELDS
    }


def test_publish_domain_event_after_commit_waits_for_managed_commit(monkeypatch):
    from app.database import db_session
    from app.events import EventScope, publish_domain_event_after_commit

    calls = []

    monkeypatch.setattr(
        "app.events.broker.publish_nowait",
        lambda *, scope, event_type, payload: calls.append((scope, event_type, payload)),
    )

    session = db_session()
    db = next(session)

    publish_domain_event_after_commit(
        db,
        scope=EventScope(kind="library"),
        event_type="bookDeleted",
        payload={"bookId": 7},
    )

    assert calls == []

    _close_session(session)

    assert calls == [(EventScope(kind="library"), "bookDeleted", {"bookId": 7})]


def test_publish_domain_event_after_commit_does_not_publish_on_rollback(monkeypatch):
    from app.database import db_session
    from app.events import EventScope, publish_domain_event_after_commit

    calls = []

    monkeypatch.setattr(
        "app.events.broker.publish_nowait",
        lambda *, scope, event_type, payload: calls.append((scope, event_type, payload)),
    )

    session = db_session()
    db = next(session)

    publish_domain_event_after_commit(
        db,
        scope=EventScope(kind="library"),
        event_type="bookDeleted",
        payload={"bookId": 7},
    )

    try:
        session.throw(RuntimeError("rollback"))
    except RuntimeError:
        pass

    assert calls == []


def test_publish_domain_event_after_commit_rollback_does_not_append_sse_publication(
    db_test,
):
    from app.database import db_session
    from app.events import EventScope, publish_domain_event_after_commit

    session = db_session()
    conn = next(session)

    with pytest.raises(RuntimeError):
        publish_domain_event_after_commit(
            conn,
            scope=EventScope(kind="library"),
            event_type="bookDeleted",
            payload={"bookId": 7},
        )
        session.throw(RuntimeError("rollback"))

    row = db_test.execute("SELECT COUNT(*) AS count FROM sse_publications").fetchone()
    assert row["count"] == 0


def test_publish_domain_event_after_commit_publishes_immediately_outside_managed_session(
    monkeypatch,
):
    from app.database import _get_db
    from app.events import EventScope, publish_domain_event_after_commit

    calls = []
    db = _get_db()

    monkeypatch.setattr(
        "app.events.broker.publish_nowait",
        lambda *, scope, event_type, payload: calls.append((scope, event_type, payload)),
    )

    publish_domain_event_after_commit(
        db,
        scope=EventScope(kind="user", user_id=2),
        event_type="bookRatingChanged",
        payload={"bookId": 7, "rating": 5},
    )

    assert calls == [
        (EventScope(kind="user", user_id=2), "bookRatingChanged", {"bookId": 7, "rating": 5})
    ]


def test_publish_domain_event_after_commit_logs_and_swallows_broker_errors(
    monkeypatch,
    caplog,
):
    from app.database import db_session
    from app.events import EventScope, publish_domain_event_after_commit

    def failing_publish(**_kwargs):
        raise RuntimeError("broker down")

    monkeypatch.setattr("app.events.broker.publish_nowait", failing_publish)

    session = db_session()
    db = next(session)

    publish_domain_event_after_commit(
        db,
        scope=EventScope(kind="user", user_id=2),
        event_type="bookRatingChanged",
        payload={"bookId": 7, "rating": 5},
    )

    with caplog.at_level(logging.ERROR, logger="librarium.events"):
        _close_session(session)

    assert "Failed to publish domain event after commit" in caplog.text


def test_update_book_publishes_library_book_updated(admin_client, captured_domain_events):
    response = admin_client.put(
        "/api/books/1",
        json={"title": "Evented Title", "publisher": "Evented Publisher"},
    )

    data = assert_ok(response)

    assert captured_domain_events == [
        {
            "scope": {"kind": "library"},
            "event": {
                "type": "bookUpdated",
                "payload": {
                    "book": _without_user_scoped_fields(data["book"]),
                    "changedFields": ["title", "publisher"],
                },
            },
        }
    ]
    assert "affected" not in captured_domain_events[0]["event"]["payload"]


def test_update_book_library_payload_excludes_user_scoped_fields(
    admin_client,
    captured_domain_events,
):
    assert_ok(admin_client.put("/api/admin/users/2", json={"role": "admin"}))

    reader_admin = login_client(username="reader", password="reader123")

    response = reader_admin.put("/api/books/1", json={"title": "Reader Evented Title"})
    data = assert_ok(response)

    assert data["book"]["rating"] == 5
    assert data["book"]["isRead"] == 1

    event_book = captured_domain_events[0]["event"]["payload"]["book"]
    assert event_book["id"] == 1
    assert event_book["title"] == "Reader Evented Title"
    assert USER_SCOPED_BOOK_FIELDS.isdisjoint(event_book)


def test_no_op_update_does_not_publish(admin_client, captured_domain_events):
    assert_ok(admin_client.put("/api/books/1", json={}))

    assert captured_domain_events == []


def test_isbn_only_update_publishes_identifiers_changed_field(
    admin_client,
    captured_domain_events,
):
    assert_ok(admin_client.put("/api/books/1", json={"isbn": "978-1-234-56789-7"}))

    assert captured_domain_events[0]["event"]["type"] == "bookUpdated"
    assert captured_domain_events[0]["event"]["payload"]["changedFields"] == ["identifiers"]


@pytest.mark.parametrize(
    ("body", "changed_fields"),
    [
        ({"description": "Event description"}, ["description"]),
        ({"pubDate": "2026"}, ["pubDate"]),
        ({"authorIds": [2]}, ["authors"]),
        ({"seriesId": 2}, ["series"]),
        ({"seriesNumber": 4}, ["seriesNumber"]),
        ({"tagIds": [2]}, ["tags"]),
        ({"language": "en"}, ["language"]),
    ],
)
def test_update_book_changed_fields_mapping(
    admin_client,
    captured_domain_events,
    body,
    changed_fields,
):
    assert_ok(admin_client.put("/api/books/1", json=body))

    assert captured_domain_events[0]["event"]["type"] == "bookUpdated"
    assert captured_domain_events[0]["event"]["payload"]["changedFields"] == changed_fields


def test_update_book_membership_event_includes_precise_affected(admin_client, captured_domain_events):
    assert_ok(
        admin_client.put(
            "/api/books/1",
            json={
                "authorIds": [2],
                "seriesId": 2,
                "tagIds": [2],
                "language": "en",
            },
        )
    )

    payload = captured_domain_events[0]["event"]["payload"]
    assert payload["changedFields"] == ["authors", "series", "tags", "language"]
    assert payload["affected"] == {
        "authorIds": [1, 2],
        "seriesIds": [1, 2],
        "tagIds": [1, 2],
        "languages": ["ru", "en"],
    }


def test_update_book_full_semantic_no_op_publishes_nothing(
    admin_client,
    captured_domain_events,
):
    assert_ok(
        admin_client.put(
            "/api/books/1",
            json={
                "title": "Minimal Test Book",
                "description": None,
                "publisher": "Test Publisher",
                "pubDate": "2025",
                "isbn": "978-0-000-00001-0",
                "authorIds": [1],
                "seriesId": 1,
                "seriesNumber": 1,
                "tagIds": [1],
                "language": "ru",
            },
        )
    )

    assert captured_domain_events == []


def test_update_book_semantic_no_op_resolved_names_publish_nothing(
    admin_client,
    captured_domain_events,
):
    assert_ok(
        admin_client.put(
            "/api/books/1",
            json={
                "authorIds": ["Test Author"],
                "seriesId": "Test Series",
                "tagIds": ["Фэнтези"],
            },
        )
    )

    assert captured_domain_events == []


def test_update_book_semantic_changes_preserve_changed_field_order(
    admin_client,
    captured_domain_events,
):
    assert_ok(
        admin_client.put(
            "/api/books/1",
            json={
                "language": "en",
                "publisher": "Changed Publisher",
                "isbn": "978-1-234-56789-7",
            },
        )
    )

    assert captured_domain_events[0]["event"]["type"] == "bookUpdated"
    assert captured_domain_events[0]["event"]["payload"]["changedFields"] == [
        "publisher",
        "identifiers",
        "language",
    ]


def test_update_book_add_formats_publishes_files_changed_field(
    admin_client,
    captured_domain_events,
):
    temp_id = _upload_temp(admin_client, "minimal.epub")

    assert_ok(admin_client.put("/api/books/1", json={"addFormats": [temp_id]}))

    assert captured_domain_events[0]["event"]["type"] == "bookUpdated"
    assert captured_domain_events[0]["event"]["payload"]["changedFields"] == ["files"]


def test_update_book_delete_existing_format_publishes_files_changed_field(
    admin_client,
    captured_domain_events,
):
    assert_ok(admin_client.put("/api/books/1", json={"deleteFormats": ["FB2"]}))

    assert captured_domain_events[0]["event"]["type"] == "bookUpdated"
    assert captured_domain_events[0]["event"]["payload"]["changedFields"] == ["files"]


def test_update_book_delete_missing_format_does_not_publish_files_change(
    admin_client,
    captured_domain_events,
):
    assert_ok(admin_client.put("/api/books/1", json={"deleteFormats": ["XYZ"]}))

    assert captured_domain_events == []


def test_update_book_commit_cover_publishes_cover_path_changed_field(
    admin_client,
    captured_domain_events,
):
    with open(FIXTURES / "../test_cover.png", "rb") as f:
        assert_ok(
            admin_client.post(
                "/api/books/2/cover",
                files={"file": ("new.png", f, "image/png")},
            )
        )

    assert_ok(admin_client.put("/api/books/2", json={"commitCover": True}))

    assert captured_domain_events[0]["event"]["type"] == "bookUpdated"
    assert captured_domain_events[0]["event"]["payload"]["changedFields"] == ["coverPath"]


def test_update_book_commit_cover_race_does_not_publish_cover_path(
    admin_client,
    captured_domain_events,
    monkeypatch,
):
    monkeypatch.setattr("app.services.book_service.cover_service._find_temp_cover", lambda _book_id: "2-cover.png")
    monkeypatch.setattr("app.services.book_service.cover_service._commit", lambda _db, _book_id: False)

    assert_ok(admin_client.put("/api/books/2", json={"commitCover": True}))

    assert captured_domain_events == []


def test_add_format_publishes_files_change(admin_client, captured_domain_events):
    temp_id = _upload_temp(admin_client, "minimal.epub")

    assert_ok(admin_client.post("/api/books/1/add-format", json={"tempId": temp_id}))

    assert captured_domain_events == [
        {
            "scope": {"kind": "library"},
            "event": {
                "type": "bookUpdated",
                "payload": {"book": {"id": 1}, "changedFields": ["files"]},
            },
        }
    ]


def test_invalid_add_format_publishes_nothing(admin_client, captured_domain_events):
    temp_id = _upload_temp(admin_client, "minimal.epub")

    assert_error(admin_client.post("/api/books/999/add-format", json={"tempId": temp_id}), 404)

    assert captured_domain_events == []


def test_delete_book_publishes_book_deleted(admin_client, captured_domain_events):
    assert_ok(admin_client.delete("/api/books/1"))

    assert captured_domain_events == [
        {
            "scope": {"kind": "library"},
            "event": {
                "type": "bookDeleted",
                "payload": {"bookId": 1},
            },
        }
    ]


def test_upload_create_publishes_book_created(admin_client, captured_domain_events):
    temp_id = _upload_temp(admin_client, "minimal.epub")

    data = assert_ok(
        admin_client.post(
            "/api/books/create",
            json={
                "tempId": temp_id,
                "metadata": {"title": "Created Event Book", "authors": "Event Author"},
            },
        )
    )

    assert captured_domain_events == [
        {
            "scope": {"kind": "library"},
            "event": {
                "type": "bookCreated",
                "payload": {"bookId": data["bookId"]},
            },
        }
    ]


@pytest.mark.parametrize(
    ("method", "path", "json_body", "event_type", "payload"),
    [
        ("put", "/api/authors/1", {"name": "Renamed Author"}, "authorRenamed", {"authorId": 1, "name": "Renamed Author"}),
        ("post", "/api/authors/1/merge", {"sourceId": 3}, "authorMerged", {"targetId": 1, "sourceId": 3}),
        ("delete", "/api/authors/99", None, "authorDeleted", {"authorId": 99}),
        ("put", "/api/series/1", {"name": "Renamed Series"}, "seriesRenamed", {"seriesId": 1, "name": "Renamed Series"}),
        ("post", "/api/series/1/merge", {"sourceId": 2}, "seriesMerged", {"targetId": 1, "sourceId": 2}),
        ("delete", "/api/series/99", None, "seriesDeleted", {"seriesId": 99}),
        ("put", "/api/tags/1", {"name": "Renamed Tag"}, "tagRenamed", {"tagId": 1, "name": "Renamed Tag"}),
        ("post", "/api/tags/2/merge", {"sourceId": 1}, "tagMerged", {"targetId": 2, "sourceId": 1}),
        ("delete", "/api/tags/99", None, "tagDeleted", {"tagId": 99}),
    ],
)
def test_entity_mutations_publish_library_events(
    admin_client,
    db,
    captured_domain_events,
    method,
    path,
    json_body,
    event_type,
    payload,
):
    if event_type == "authorDeleted":
        db.execute(
            "INSERT INTO authors (id, name, sort_name) VALUES (99, 'Empty Author', 'Author, Empty')"
        )
        db.commit()
    elif event_type == "seriesDeleted":
        db.execute(
            "INSERT INTO series (id, name, sort_name) VALUES (99, 'Empty Series', 'Empty Series')"
        )
        db.commit()
    elif event_type == "tagDeleted":
        db.execute(
            "INSERT INTO tags (id, name) VALUES (99, 'Empty Tag')"
        )
        db.commit()

    if json_body is None:
        response = getattr(admin_client, method)(path)
    else:
        response = getattr(admin_client, method)(path, json=json_body)

    assert_ok(response)
    assert captured_domain_events == [
        {
            "scope": {"kind": "library"},
            "event": {"type": event_type, "payload": payload},
        }
    ]


@pytest.mark.parametrize(
    ("method", "path", "json_body"),
    [
        ("put", "/api/authors/1", {"name": "  Test Author  "}),
        ("put", "/api/series/1", {"name": "  Test Series  "}),
        ("post", "/api/authors/1/merge", {"sourceId": 999}),
        ("post", "/api/series/1/merge", {"sourceId": 999}),
    ],
)
def test_entity_semantic_no_ops_publish_nothing(
    admin_client,
    captured_domain_events,
    method,
    path,
    json_body,
):
    assert_ok(getattr(admin_client, method)(path, json=json_body))

    assert captured_domain_events == []



def _assert_single_user_event(captured_domain_events, event_type: str, payload: dict):
    assert captured_domain_events == [
        {
            "scope": {"kind": "user", "userId": 2},
            "event": {"type": event_type, "payload": payload},
        }
    ]


def test_rating_publishes_user_scoped_event(reader_client, captured_domain_events):
    assert_ok(reader_client.put("/api/books/3/rating", json={"rating": 4}))

    _assert_single_user_event(
        captured_domain_events,
        "bookRatingChanged",
        {"bookId": 3, "rating": 4},
    )


def test_read_publishes_user_scoped_event(reader_client, captured_domain_events):
    assert_ok(reader_client.put("/api/books/3/read", json={"isRead": True}))

    _assert_single_user_event(
        captured_domain_events,
        "bookReadChanged",
        {"bookId": 3, "isRead": True},
    )


def test_hidden_publishes_user_scoped_event(reader_client, captured_domain_events):
    assert_ok(reader_client.put("/api/books/3/hidden", json={"isHidden": True}))

    _assert_single_user_event(
        captured_domain_events,
        "bookHiddenChanged",
        {"bookId": 3, "isHidden": True},
    )


def test_same_rating_publishes_nothing(reader_client, captured_domain_events):
    assert_ok(reader_client.put("/api/books/1/rating", json={"rating": 5}))

    assert captured_domain_events == []


def test_same_read_flag_publishes_nothing(reader_client, captured_domain_events):
    assert_ok(reader_client.put("/api/books/1/read", json={"isRead": True}))

    assert captured_domain_events == []


def test_default_unread_without_user_book_row_publishes_nothing(
    reader_client,
    db,
    captured_domain_events,
):
    assert not _user_book_row_exists(db, user_id=2, book_id=2)

    assert_ok(reader_client.put("/api/books/2/read", json={"isRead": False}))

    assert not _user_book_row_exists(db, user_id=2, book_id=2)
    assert captured_domain_events == []


def test_same_hidden_flag_publishes_nothing(reader_client, captured_domain_events):
    assert_ok(reader_client.put("/api/books/3/hidden", json={"isHidden": True}))
    captured_domain_events.clear()

    assert_ok(reader_client.put("/api/books/3/hidden", json={"isHidden": True}))

    assert captured_domain_events == []


def test_default_unhidden_without_user_book_row_publishes_nothing(
    reader_client,
    db,
    captured_domain_events,
):
    assert not _user_book_row_exists(db, user_id=2, book_id=2)

    assert_ok(reader_client.put("/api/books/2/hidden", json={"isHidden": False}))

    assert not _user_book_row_exists(db, user_id=2, book_id=2)
    assert captured_domain_events == []


def test_create_shelf_publishes_user_scoped_event(reader_client, captured_domain_events):
    data = assert_ok(reader_client.post("/api/shelves", json={"name": "Event Shelf"}))

    _assert_single_user_event(
        captured_domain_events,
        "shelfCreated",
        {"shelfId": data["id"], "name": "Event Shelf"},
    )


def test_rename_shelf_publishes_user_scoped_event(reader_client, captured_domain_events):
    shelf_id = assert_ok(reader_client.post("/api/shelves", json={"name": "Old Shelf"}))["id"]
    captured_domain_events.clear()

    assert_ok(reader_client.put(f"/api/shelves/{shelf_id}", json={"name": "Renamed Shelf"}))

    _assert_single_user_event(
        captured_domain_events,
        "shelfRenamed",
        {"shelfId": shelf_id, "name": "Renamed Shelf"},
    )


def test_delete_shelf_publishes_user_scoped_event(reader_client, captured_domain_events):
    shelf_id = assert_ok(reader_client.post("/api/shelves", json={"name": "Delete Shelf"}))["id"]
    captured_domain_events.clear()

    assert_ok(reader_client.delete(f"/api/shelves/{shelf_id}"))

    _assert_single_user_event(
        captured_domain_events,
        "shelfDeleted",
        {"shelfId": shelf_id},
    )


def test_add_book_to_shelf_publishes_user_scoped_event(reader_client, captured_domain_events):
    shelf_id = assert_ok(reader_client.post("/api/shelves", json={"name": "Membership Shelf"}))["id"]
    captured_domain_events.clear()

    assert_ok(reader_client.post(f"/api/shelves/{shelf_id}/books", json={"bookId": 1}))

    assert len(captured_domain_events) == 1
    event_record = captured_domain_events[0]
    assert event_record["scope"] == {"kind": "user", "userId": 2}
    assert event_record["event"]["type"] == "shelfMembershipChanged"

    payload = event_record["event"]["payload"]
    assert payload["shelfId"] == shelf_id
    assert payload["bookId"] == 1
    assert payload["hasBook"] is True

    book = payload["book"]
    assert book["id"] == 1
    assert isinstance(book["title"], str)
    assert isinstance(book["authors"], list)
    # Каждый элемент authors[] — это сериализованный AuthorRef со shape {id: int, name: str}
    assert all(
        isinstance(a, dict) and isinstance(a.get("id"), int) and isinstance(a.get("name"), str)
        for a in book["authors"]
    )
    assert "series" in book  # SeriesRef | None — field present, value may be None
    assert "seriesNumber" in book  # float | None — field present, value may be None
    assert isinstance(book["coverPath"], str)
    assert book["coverPath"].startswith("/api/covers/1")
    assert "rating" in book  # int | None — field present (user-scoped)
    assert isinstance(book["isRead"], bool)  # user-scoped field present


def test_remove_book_from_shelf_publishes_user_scoped_event(reader_client, captured_domain_events):
    shelf_id = assert_ok(reader_client.post("/api/shelves", json={"name": "Membership Shelf"}))["id"]
    assert_ok(reader_client.post(f"/api/shelves/{shelf_id}/books", json={"bookId": 1}))
    captured_domain_events.clear()

    assert_ok(reader_client.delete(f"/api/shelves/{shelf_id}/books/1"))

    _assert_single_user_event(
        captured_domain_events,
        "shelfMembershipChanged",
        {"shelfId": shelf_id, "bookId": 1, "hasBook": False},
    )


def test_duplicate_add_book_to_shelf_publishes_nothing(reader_client, captured_domain_events):
    shelf_id = assert_ok(reader_client.post("/api/shelves", json={"name": "Duplicate Shelf"}))["id"]
    assert_ok(reader_client.post(f"/api/shelves/{shelf_id}/books", json={"bookId": 1}))
    captured_domain_events.clear()

    assert_ok(reader_client.post(f"/api/shelves/{shelf_id}/books", json={"bookId": 1}))

    assert captured_domain_events == []


def test_remove_missing_book_from_shelf_publishes_nothing(reader_client, captured_domain_events):
    shelf_id = assert_ok(reader_client.post("/api/shelves", json={"name": "Missing Shelf"}))["id"]
    captured_domain_events.clear()

    assert_ok(reader_client.delete(f"/api/shelves/{shelf_id}/books/3"))

    assert captured_domain_events == []


def test_add_book_to_system_shelf_publishes_nothing(
    reader_client,
    db,
    reading_now_shelf_id,
    captured_domain_events,
):
    assert not _shelf_book_row_exists(db, shelf_id=reading_now_shelf_id, book_id=2)

    assert_ok(reader_client.post(f"/api/shelves/{reading_now_shelf_id}/books", json={"bookId": 2}))

    assert _shelf_book_row_exists(db, shelf_id=reading_now_shelf_id, book_id=2)
    assert captured_domain_events == []


def test_remove_book_from_system_shelf_publishes_nothing(
    reader_client,
    db,
    reading_now_shelf_id,
    captured_domain_events,
):
    assert_ok(reader_client.post(f"/api/shelves/{reading_now_shelf_id}/books", json={"bookId": 2}))
    assert _shelf_book_row_exists(db, shelf_id=reading_now_shelf_id, book_id=2)
    captured_domain_events.clear()

    assert_ok(reader_client.delete(f"/api/shelves/{reading_now_shelf_id}/books/2"))

    assert not _shelf_book_row_exists(db, shelf_id=reading_now_shelf_id, book_id=2)
    assert captured_domain_events == []


def test_same_name_shelf_rename_publishes_nothing(reader_client, captured_domain_events):
    shelf_id = assert_ok(reader_client.post("/api/shelves", json={"name": "Same Name Shelf"}))["id"]
    captured_domain_events.clear()

    assert_ok(reader_client.put(f"/api/shelves/{shelf_id}", json={"name": "Same Name Shelf"}))

    assert captured_domain_events == []


def test_accepted_reading_progress_publishes_user_scoped_event(
    reader_client,
    captured_domain_events,
):
    response = assert_ok(
        reader_client.put(
            "/api/reader/progress/1",
            json={
                "position": "p1",
                "lastDevice": "test",
                "lastFormat": "EPUB",
                "fraction": 0.1,
                "expectedVersion": 0,
            },
        )
    )

    assert response["accepted"] is True
    _assert_single_user_event(
        captured_domain_events,
        "readingProgressChanged",
        {
            "bookId": 1,
            "hadPosition": False,
            "hasPosition": True,
            "lastReadAtChanged": True,
        },
    )


def test_accepted_reading_progress_empty_position_reports_position_state(
    reader_client,
    captured_domain_events,
):
    assert_ok(
        reader_client.put(
            "/api/reader/progress/1",
            json={
                "position": "p1",
                "lastDevice": "test",
                "lastFormat": "EPUB",
                "fraction": 0.1,
                "expectedVersion": 0,
            },
        )
    )
    captured_domain_events.clear()

    response = assert_ok(
        reader_client.put(
            "/api/reader/progress/1",
            json={
                "position": "",
                "lastDevice": "test",
                "lastFormat": "EPUB",
                "fraction": 0.2,
                "expectedVersion": 1,
            },
        )
    )

    assert response["accepted"] is True
    _assert_single_user_event(
        captured_domain_events,
        "readingProgressChanged",
        {
            "bookId": 1,
            "hadPosition": True,
            "hasPosition": False,
            "lastReadAtChanged": True,
        },
    )


def test_rejected_reading_progress_publishes_nothing(reader_client, captured_domain_events):
    accepted = assert_ok(
        reader_client.put(
            "/api/reader/progress/1",
            json={
                "position": "far",
                "lastDevice": "test",
                "lastFormat": "EPUB",
                "fraction": 0.8,
                "expectedVersion": 0,
            },
        )
    )
    assert accepted["accepted"] is True
    captured_domain_events.clear()

    rejected = assert_ok(
        reader_client.put(
            "/api/reader/progress/1",
            json={
                "position": "back",
                "lastDevice": "test",
                "lastFormat": "EPUB",
                "fraction": 0.2,
                "expectedVersion": 0,
            },
        )
    )

    assert rejected["accepted"] is False
    assert captured_domain_events == []

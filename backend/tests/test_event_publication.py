import logging
from pathlib import Path

import pytest

from tests._helpers import assert_error, assert_ok


FIXTURES = Path(__file__).resolve().parent / "fixtures" / "books"


def _close_session(session):
    try:
        next(session)
    except StopIteration:
        return


@pytest.fixture
def captured_domain_events(monkeypatch):
    calls = []

    def capture(*, scope, event_type, payload):
        calls.append(
            {
                "scope": scope.to_wire(),
                "event": {"type": event_type, "payload": payload},
            }
        )

    monkeypatch.setattr("app.events.broker.publish_nowait", capture)
    return calls


def _upload_temp(client, filename: str) -> str:
    with open(FIXTURES / filename, "rb") as f:
        response = client.post(
            "/api/upload",
            files={"file": (filename, f, "application/octet-stream")},
        )
    return assert_ok(response)["tempId"]


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
                    "book": data["book"],
                    "changedFields": ["title", "publisher"],
                },
            },
        }
    ]
    assert "affected" not in captured_domain_events[0]["event"]["payload"]


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


def test_tag_map_publishes_tag_mapped(admin_client, captured_domain_events):
    assert_ok(admin_client.put("/api/tags/1/map", json={"name": "  Event Fantasy  "}))

    assert captured_domain_events == [
        {
            "scope": {"kind": "library"},
            "event": {
                "type": "tagMapped",
                "payload": {"tagId": 1, "targetId": 1, "name": "Event Fantasy"},
            },
        }
    ]


def test_tag_map_event_name_matches_normalized_committed_name(
    admin_client,
    captured_domain_events,
):
    result = assert_ok(admin_client.put("/api/tags/1/map", json={"name": "event fantasy"}))
    tag = assert_ok(admin_client.get(f"/api/tags/{result['targetId']}"))["tag"]

    assert tag["name"] == "Event fantasy"
    assert captured_domain_events == [
        {
            "scope": {"kind": "library"},
            "event": {
                "type": "tagMapped",
                "payload": {"tagId": 1, "targetId": 1, "name": tag["name"]},
            },
        }
    ]


def test_tag_map_same_name_publishes_nothing(admin_client, captured_domain_events):
    assert_ok(admin_client.put("/api/tags/1/map", json={"name": "  Фэнтези  "}))

    assert captured_domain_events == []

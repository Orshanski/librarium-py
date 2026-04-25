from app.dtos._aliases import to_camel
from app.dtos._refs import AuthorRef, TagRef, SeriesRef


def test_to_camel_single_word():
    assert to_camel("title") == "title"


def test_to_camel_two_words():
    assert to_camel("cover_path") == "coverPath"


def test_to_camel_three_words():
    assert to_camel("last_read_at") == "lastReadAt"


def test_to_camel_already_camel_unchanged():
    assert to_camel("isRead") == "isRead"


def test_to_camel_leading_underscores():
    assert to_camel("__foo") == "foo"


def test_to_camel_trailing_underscore():
    assert to_camel("foo_") == "foo"


def test_to_camel_consecutive_underscores():
    assert to_camel("foo__bar") == "fooBar"


def test_to_camel_empty_string():
    assert to_camel("") == ""


def test_to_camel_all_underscores():
    assert to_camel("___") == ""


def test_author_ref_basic():
    a = AuthorRef(id=1, name="Толстой")
    assert a.id == 1
    assert a.name == "Толстой"
    assert a.model_dump() == {"id": 1, "name": "Толстой"}


def test_author_ref_validate_json():
    a = AuthorRef.model_validate_json('{"id": 7, "name": "Пушкин"}')
    assert a.id == 7
    assert a.name == "Пушкин"


def test_tag_ref_basic():
    t = TagRef(id=2, name="фантастика")
    assert t.model_dump() == {"id": 2, "name": "фантастика"}


def test_series_ref_basic():
    s = SeriesRef(id=3, name="Властелин Колец")
    assert s.model_dump() == {"id": 3, "name": "Властелин Колец"}

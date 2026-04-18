"""Unit-тесты для cleanup_temp_session."""
from app.services.temp_cleanup import cleanup_temp_session


def test_cleanup_removes_book_and_cover(tmp_path, monkeypatch):
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup, "UPLOADS_DIR", tmp_path)

    (tmp_path / "abc123.fb2").write_bytes(b"book")
    (tmp_path / "abc123-cover.jpg").write_bytes(b"cover")
    (tmp_path / "other456.fb2").write_bytes(b"other")

    cleanup_temp_session("abc123")

    assert not (tmp_path / "abc123.fb2").exists()
    assert not (tmp_path / "abc123-cover.jpg").exists()
    assert (tmp_path / "other456.fb2").exists()  # другая сессия нетронута


def test_cleanup_idempotent(tmp_path, monkeypatch):
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup, "UPLOADS_DIR", tmp_path)
    cleanup_temp_session("nonexistent")  # не падает


def test_cleanup_suppresses_filenotfound(tmp_path, monkeypatch):
    """Если файл исчез между find и remove — no crash."""
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup, "UPLOADS_DIR", tmp_path)
    (tmp_path / "abc123.fb2").write_bytes(b"book")
    cleanup_temp_session("abc123")
    cleanup_temp_session("abc123")  # повторный вызов на исчезнувшем файле


def test_find_temp_file_and_covers(tmp_path, monkeypatch):
    """find_temp_file + find_temp_covers перенесены в temp_cleanup."""
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup, "UPLOADS_DIR", tmp_path)

    (tmp_path / "xyz789.epub").write_bytes(b"book")
    (tmp_path / "xyz789-cover.png").write_bytes(b"cover1")
    (tmp_path / "xyz789-cover.jpg").write_bytes(b"cover2")
    (tmp_path / "other.pdf").write_bytes(b"other")

    assert temp_cleanup.find_temp_file("xyz789") == "xyz789.epub"
    assert temp_cleanup.find_temp_file("missing") is None

    covers = sorted(temp_cleanup.find_temp_covers("xyz789"))
    assert covers == ["xyz789-cover.jpg", "xyz789-cover.png"]
    assert temp_cleanup.find_temp_covers("missing") == []

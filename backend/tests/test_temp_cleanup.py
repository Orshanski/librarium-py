"""Unit-тесты для cleanup_temp_session."""
from app.services.temp_cleanup import cleanup_temp_session


def test_cleanup_removes_book_and_cover(tmp_path, monkeypatch):
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup.storage_paths, "UPLOADS_DIR", tmp_path)

    (tmp_path / "abc123.fb2").write_bytes(b"book")
    (tmp_path / "abc123-cover.jpg").write_bytes(b"cover")
    (tmp_path / "abc123.zip").write_bytes(b"zip")
    (tmp_path / "other456.fb2").write_bytes(b"other")

    cleanup_temp_session("abc123")

    assert not (tmp_path / "abc123.fb2").exists()
    assert not (tmp_path / "abc123-cover.jpg").exists()
    assert not (tmp_path / "abc123.zip").exists()
    assert (tmp_path / "other456.fb2").exists()  # другая сессия нетронута


def test_cleanup_session_ignores_unexpected_same_session_names(tmp_path, monkeypatch):
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup.storage_paths, "UPLOADS_DIR", tmp_path)

    (tmp_path / "abc123.fb2").write_bytes(b"book")
    (tmp_path / "abc123.txt").write_bytes(b"unexpected")
    (tmp_path / "abc123-cover.txt").write_bytes(b"unexpected cover")
    (tmp_path / "abc123-cover.jpg").mkdir()

    cleanup_temp_session("abc123")

    assert not (tmp_path / "abc123.fb2").exists()
    assert (tmp_path / "abc123.txt").exists()
    assert (tmp_path / "abc123-cover.txt").exists()
    assert (tmp_path / "abc123-cover.jpg").is_dir()


def test_cleanup_idempotent(tmp_path, monkeypatch):
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup.storage_paths, "UPLOADS_DIR", tmp_path)
    cleanup_temp_session("nonexistent")  # не падает


def test_cleanup_suppresses_filenotfound(tmp_path, monkeypatch):
    """Если файл исчез между find и remove — no crash."""
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup.storage_paths, "UPLOADS_DIR", tmp_path)
    (tmp_path / "abc123.fb2").write_bytes(b"book")
    cleanup_temp_session("abc123")
    cleanup_temp_session("abc123")  # повторный вызов на исчезнувшем файле


def test_find_temp_file_and_covers(tmp_path, monkeypatch):
    """find_temp_file + find_temp_covers перенесены в temp_cleanup."""
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup.storage_paths, "UPLOADS_DIR", tmp_path)

    (tmp_path / "xyz789.epub").write_bytes(b"book")
    (tmp_path / "xyz789-cover.png").write_bytes(b"cover1")
    (tmp_path / "xyz789-cover.jpg").write_bytes(b"cover2")
    (tmp_path / "other.pdf").write_bytes(b"other")

    assert temp_cleanup.find_temp_file("xyz789") == "xyz789.epub"
    assert temp_cleanup.find_temp_file("missing") is None

    covers = sorted(temp_cleanup.find_temp_covers("xyz789"))
    assert covers == ["xyz789-cover.jpg", "xyz789-cover.png"]
    assert temp_cleanup.find_temp_covers("missing") == []


# ── cleanup_old_uploads ──

def test_cleanup_old_uploads_removes_old_preserves_fresh(tmp_path, monkeypatch):
    """Lazy orphan GC: файлы старше _GRACE_SECONDS удалены, свежие сохранены."""
    import os
    import time
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup.storage_paths, "UPLOADS_DIR", tmp_path)

    old_file = tmp_path / "old1-cover.jpg"
    fresh_file = tmp_path / "fresh1-cover.jpg"
    old_file.write_bytes(b"old orphan")
    fresh_file.write_bytes(b"in-flight session")

    # Старый файл: mtime на 2 часа назад (больше чем _GRACE_SECONDS=3600).
    old_ts = time.time() - 7200
    os.utime(old_file, (old_ts, old_ts))

    removed = temp_cleanup.cleanup_old_uploads()

    assert removed == 1
    assert not old_file.exists()
    assert fresh_file.exists()


def test_cleanup_old_uploads_no_files_returns_zero(tmp_path, monkeypatch):
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup.storage_paths, "UPLOADS_DIR", tmp_path)
    assert temp_cleanup.cleanup_old_uploads() == 0


def test_cleanup_old_uploads_all_fresh(tmp_path, monkeypatch):
    """Если все файлы свежие — ничего не удаляется, count=0."""
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup.storage_paths, "UPLOADS_DIR", tmp_path)

    (tmp_path / "a.fb2").write_bytes(b"a")
    (tmp_path / "b-cover.jpg").write_bytes(b"b")

    assert temp_cleanup.cleanup_old_uploads() == 0
    assert (tmp_path / "a.fb2").exists()
    assert (tmp_path / "b-cover.jpg").exists()


def test_cleanup_old_uploads_missing_dir_no_crash(tmp_path, monkeypatch):
    """Если UPLOADS_DIR не существует — возвращает 0, не падает."""
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup.storage_paths, "UPLOADS_DIR", tmp_path / "does-not-exist")
    assert temp_cleanup.cleanup_old_uploads() == 0


def test_cleanup_old_uploads_ignores_directories(tmp_path, monkeypatch):
    """Subdirectories старше grace не трогаются — UPLOADS_DIR плоский, их быть
    не должно, но если появились — не наше дело их сносить."""
    import os
    import time
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup.storage_paths, "UPLOADS_DIR", tmp_path)

    old_subdir = tmp_path / "old_subdir"
    old_subdir.mkdir()
    old_ts = time.time() - 7200
    os.utime(old_subdir, (old_ts, old_ts))

    assert temp_cleanup.cleanup_old_uploads() == 0
    assert old_subdir.exists()


def test_cleanup_old_uploads_ignores_unexpected_names(tmp_path, monkeypatch):
    """Old files with names outside upload policy are preserved."""
    import os
    import time
    from app.services import temp_cleanup
    monkeypatch.setattr(temp_cleanup.storage_paths, "UPLOADS_DIR", tmp_path)

    valid_old = tmp_path / "abc123.fb2"
    unexpected_old = tmp_path / "abc123.txt"
    nested_like_old = tmp_path / "nested.name.txt"
    valid_old.write_bytes(b"book")
    unexpected_old.write_bytes(b"unexpected")
    nested_like_old.write_bytes(b"unexpected")

    old_ts = time.time() - 7200
    for path in (valid_old, unexpected_old, nested_like_old):
        os.utime(path, (old_ts, old_ts))

    assert temp_cleanup.cleanup_old_uploads() == 1
    assert not valid_old.exists()
    assert unexpected_old.exists()
    assert nested_like_old.exists()

import pytest

from app.exceptions import BadInputError
from app import storage_paths as sp


def test_library_book_file_accepts_known_book_extension():
    path = sp.library_book_file(42, "epub")
    assert path.name == "book.epub"
    assert path.parent.name == "42"


def test_library_book_file_rejects_symlinked_book_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(sp, "LIBRARY_DIR", tmp_path)
    target_dir = tmp_path / "2"
    target_dir.mkdir()
    (tmp_path / "1").symlink_to(target_dir, target_is_directory=True)

    with pytest.raises(BadInputError):
        sp.library_book_file(1, "epub")


def test_library_book_file_rejects_symlinked_file_component(tmp_path, monkeypatch):
    monkeypatch.setattr(sp, "LIBRARY_DIR", tmp_path)
    book_dir = tmp_path / "1"
    book_dir.mkdir()
    (book_dir / "cover.jpg").write_bytes(b"cover")
    (book_dir / "book.epub").symlink_to(book_dir / "cover.jpg")

    with pytest.raises(BadInputError):
        sp.library_book_file(1, "epub")


@pytest.mark.parametrize("ext", ["../pdf", "/pdf", "txt", "pdf/../../x"])
def test_library_book_file_rejects_unsafe_extension(ext):
    with pytest.raises(BadInputError):
        sp.library_book_file(42, ext)


def test_library_cover_file_accepts_existing_gif_behavior():
    path = sp.library_cover_file(42, "gif")
    assert path.name == "cover.gif"
    assert path.parent.name == "42"


@pytest.mark.parametrize("temp_id", ["abc123", "A_b-123"])
def test_upload_book_file_accepts_generated_temp_ids(temp_id):
    assert sp.upload_book_file(temp_id, "fb2").name == f"{temp_id}.fb2"


@pytest.mark.parametrize("temp_id", ["../x", "/tmp/x", "a/b", "", "x" * 65])
def test_upload_book_file_rejects_unsafe_temp_ids(temp_id):
    with pytest.raises(BadInputError):
        sp.upload_book_file(temp_id, "fb2")


@pytest.mark.parametrize("temp_id", ["../x", "/tmp/x", "a/b", "", "x" * 65])
def test_upload_cover_file_rejects_unsafe_temp_ids(temp_id):
    with pytest.raises(BadInputError):
        sp.upload_cover_file(temp_id, "jpg")


@pytest.mark.parametrize("temp_id", ["../x", "/tmp/x", "a/b", "", "x" * 65])
def test_upload_zip_file_rejects_unsafe_temp_ids(temp_id):
    with pytest.raises(BadInputError):
        sp.upload_zip_file(temp_id)


@pytest.mark.parametrize(
    "name",
    ["abc123.fb2", "abc123-cover.jpg", "abc123.zip"],
)
def test_upload_file_from_basename_accepts_policy_shapes(name):
    assert sp.upload_file_from_basename(name).name == name


@pytest.mark.parametrize(
    "name",
    ["../abc123.fb2", "abc123.txt", "abc123-cover.txt", "abc123.fb2.bak", "nested/name.fb2", ""],
)
def test_upload_file_from_basename_ignores_unexpected_shapes(name):
    assert sp.upload_file_from_basename(name) is None


def test_upload_book_file_rejects_symlinked_file_component(tmp_path, monkeypatch):
    monkeypatch.setattr(sp, "UPLOADS_DIR", tmp_path)
    (tmp_path / "victim.fb2").write_bytes(b"victim")
    (tmp_path / "abc123.fb2").symlink_to(tmp_path / "victim.fb2")

    with pytest.raises(BadInputError):
        sp.upload_book_file("abc123", "fb2")


def test_library_backup_file_requires_managed_library_path():
    original = sp.library_book_file(42, "pdf")
    assert sp.library_backup_file(original).name == "book.pdf.bak"

    cover = sp.library_cover_file(42, "gif")
    assert sp.library_backup_file(cover).name == "cover.gif.bak"

    with pytest.raises(BadInputError):
        sp.library_backup_file("/tmp/book.pdf")


@pytest.mark.parametrize("path", [
    sp.library_book_dir(42) / "notes.txt",
    sp.library_book_dir(42),
    sp.library_book_dir(42) / "book.txt",
])
def test_library_backup_file_rejects_non_canonical_library_paths(path):
    with pytest.raises(BadInputError):
        sp.library_backup_file(path)


def test_library_file_from_db_path_binds_book_id_and_extension():
    path = sp.library_file_from_db_path(42, "data/library/42/book.epub", {"epub"})
    assert path.name == "book.epub"

    with pytest.raises(BadInputError):
        sp.library_file_from_db_path(42, "data/library/43/book.epub", {"epub"})

    with pytest.raises(BadInputError):
        sp.library_file_from_db_path(42, "data/library/42/book.txt", {"epub"})


@pytest.mark.parametrize(
    "db_path",
    [
        "./data/library/42/book.epub",
        "data/library//42/book.epub",
        "data/library/42/book.epub/.",
    ],
)
def test_library_file_from_db_path_rejects_non_canonical_db_path(db_path):
    with pytest.raises(BadInputError):
        sp.library_file_from_db_path(42, db_path, {"epub"})


def test_frontend_static_file_rejects_escape():
    assert sp.frontend_static_file("../backend/app/main.py") is None

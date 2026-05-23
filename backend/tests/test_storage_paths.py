import pytest

from app.exceptions import BadInputError
from app import storage_paths as sp


def test_library_book_file_accepts_known_book_extension():
    path = sp.library_book_file(42, "epub")
    assert path.name == "book.epub"
    assert path.parent.name == "42"


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

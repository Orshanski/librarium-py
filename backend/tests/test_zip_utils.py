"""Tests for safe_zip_read — zip-bomb (decompression) guard."""
import io
import zipfile

import pytest

from app.zip_utils import safe_zip_read
from app.exceptions import BadInputError
from app.config import MAX_BOOK_SIZE


def _make_zip(name: str, data: bytes) -> zipfile.ZipFile:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(name, data)
    buf.seek(0)
    return zipfile.ZipFile(buf, "r")


def test_returns_data_within_limit():
    zf = _make_zip("a.txt", b"hello")
    assert safe_zip_read(zf, "a.txt", max_size=100) == b"hello"


def test_rejects_oversize_entry():
    """Uncompressed size over the limit must be rejected before reading."""
    zf = _make_zip("big.txt", b"x" * 1000)
    with pytest.raises(BadInputError):
        safe_zip_read(zf, "big.txt", max_size=500)


def test_zip_bomb_rejected_by_uncompressed_size():
    """A highly-compressible entry (tiny on disk, huge uncompressed) is rejected
    by its declared file_size — without decompressing it into memory."""
    zf = _make_zip("bomb.bin", b"\x00" * (5 * 1024 * 1024))  # 5 MB of zeros, compresses to ~KB
    with pytest.raises(BadInputError):
        safe_zip_read(zf, "bomb.bin", max_size=64 * 1024)


def test_default_limit_is_max_book_size():
    """Without an explicit limit, the default ceiling is MAX_BOOK_SIZE."""
    zf = _make_zip("a.txt", b"data")
    assert safe_zip_read(zf, "a.txt") == b"data"
    info = zf.getinfo("a.txt")
    assert info.file_size <= MAX_BOOK_SIZE


def test_default_limit_follows_config_at_call_time(monkeypatch):
    """The default ceiling is read from config at call time, not bound at import —
    so monkeypatching config.MAX_BOOK_SIZE actually lowers the limit."""
    from app import config

    monkeypatch.setattr(config, "MAX_BOOK_SIZE", 100)
    zf = _make_zip("big.txt", b"x" * 500)  # 500 bytes > patched 100
    with pytest.raises(BadInputError):
        safe_zip_read(zf, "big.txt")  # no explicit max_size → must use patched config


def test_missing_entry_raises_keyerror():
    """Missing entries propagate KeyError, same as zipfile.ZipFile.read."""
    zf = _make_zip("a.txt", b"data")
    with pytest.raises(KeyError):
        safe_zip_read(zf, "missing.txt", max_size=100)

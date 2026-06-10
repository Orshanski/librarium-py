"""Safe ZIP reading — guard against zip-bomb (decompression) attacks.

A ZIP entry's compressed size is bounded by the upload limit, but its
*uncompressed* size is not: a high-ratio DEFLATE entry can be a few KB on
disk yet expand to gigabytes in memory when read, killing the process (OOM).

``safe_zip_read`` checks the declared uncompressed size (``ZipInfo.file_size``,
read from the central directory — no decompression) against a ceiling before
calling ``ZipFile.read``. Every read from an untrusted archive should go
through this helper instead of a bare ``zf.read``.
"""
import zipfile

from . import config
from .exceptions import BadInputError


def safe_zip_read(zf: zipfile.ZipFile, name: str, max_size: int | None = None) -> bytes:
    """Read a ZIP entry, rejecting it if its uncompressed size exceeds ``max_size``.

    ``max_size`` defaults to ``config.MAX_BOOK_SIZE``, read at call time (not bound
    at import) so the ceiling stays patchable in tests and follows config changes.

    Raises ``BadInputError`` (→ HTTP 400) on oversize. Missing entries propagate
    ``KeyError``, identical to ``zipfile.ZipFile.read``.
    """
    if max_size is None:
        max_size = config.MAX_BOOK_SIZE
    info = zf.getinfo(name)
    if info.file_size > max_size:
        raise BadInputError(
            f"Запись в архиве слишком большая: {name} "
            f"({info.file_size} байт, макс. {max_size})"
        )
    return zf.read(name)

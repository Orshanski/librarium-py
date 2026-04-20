"""Проверяет, что каждый .sql-файл в backend/app/dal/queries/:
(a) содержит ровно один `-- name:` маркер;
(b) имя в маркере (до скобок параметров и суффикса ^/!/<!) совпадает с basename файла.
"""
import re
from pathlib import Path

import pytest

QUERIES_DIR = Path(__file__).resolve().parent.parent / "app" / "dal" / "queries"


def iter_sql_files():
    if not QUERIES_DIR.exists():
        return []
    return sorted(QUERIES_DIR.rglob("*.sql"))


@pytest.mark.parametrize("sql_file", iter_sql_files(), ids=lambda p: str(p.relative_to(QUERIES_DIR)))
def test_sql_name_matches_filename(sql_file: Path):
    """aiosql v15 format: `-- name: <basename>(<params>)<marker>`.
    Тест проверяет что basename в маркере совпадает с именем файла.
    """
    content = sql_file.read_text()
    # \w+ захватывает basename до первой не-буквенно-цифровой (скобки, суффикс)
    markers = re.findall(r"^--\s*name:\s*(\w+)", content, re.MULTILINE)
    assert len(markers) == 1, f"{sql_file}: expected exactly 1 `-- name:` marker, found {len(markers)}"
    expected = sql_file.stem
    assert markers[0] == expected, f"{sql_file}: `-- name: {markers[0]}(...)` must match filename '{expected}'"

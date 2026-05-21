import sqlite3
from pathlib import Path
from typing import cast

import aiosql

from ..database import dicts_from_rows, dict_from_row
from ..dtos.catalog import CatalogFilters
from ..dtos.entities import (
    FilterOptionRow,
    TagCloudEntry,
    TagDetailBookRow,
    TagDetailRow,
    TagMapResult,
)
from ..exceptions import BadInputError, NotFoundError
from ._parsers import parse_book_row_aggregates
from .filters import build_book_where
from .sort import resolve_order_clause

queries = aiosql.from_path(Path(__file__).parent / "queries" / "tags", "sqlite3")


def get_tag_cloud(db: sqlite3.Connection, top: int | None = None) -> list[TagCloudEntry]:
    """Tag cloud: name + book_count, sorted by count DESC."""
    limit_clause = "LIMIT :top" if top else ""
    params = {"top": top} if top else {}
    # SQL-safe: {limit_clause} from whitelist-source.
    final_sql = queries.get_tag_cloud.sql.replace("{limit_clause}", limit_clause)
    return cast(list[TagCloudEntry], dicts_from_rows(db.execute(final_sql, params).fetchall()))


def list_tag_options(db: sqlite3.Connection, *, user_id: int, filters: CatalogFilters) -> list[FilterOptionRow]:
    """Tag options for filter bar, scoped by other filters."""
    where, params = build_book_where(filters, user_id=user_id, exclude="tagIds")
    # SQL-safe: {where_clause} from whitelist-source (build_book_where).
    final_sql = queries.list_tag_options.sql.replace("{where_clause}", where)
    return cast(list[FilterOptionRow], dicts_from_rows(db.execute(final_sql, params).fetchall()))


def get_tag_by_id(
    db: sqlite3.Connection,
    tag_id: int,
    user_id: int,
    author_ids: list[int] | None = None,
    series_ids: list[int] | None = None,
    language: list[str] | None = None,
    sort: str = "addedDesc",
) -> TagDetailRow | None:
    tag = dict_from_row(queries.get_tag_header(db, id=tag_id))
    if not tag:
        return None

    filters: CatalogFilters = {}
    if author_ids:
        filters["authorIds"] = author_ids
    if series_ids:
        filters["seriesIds"] = series_ids
    if language:
        filters["language"] = language

    where_sql, params = build_book_where(filters)
    params["id"] = tag_id
    params["uid"] = user_id
    order_clause = resolve_order_clause(sort)

    final_sql = (
        queries.get_tag_books.sql
        .replace("{where_clause}", where_sql)
        .replace("{order_clause}", order_clause)
    )
    books = dicts_from_rows(db.execute(final_sql, params).fetchall())
    for r in books:
        parse_book_row_aggregates(r)
    return cast(TagDetailRow, {"tag": tag, "books": cast(list[TagDetailBookRow], books)})


def resolve_raw_tag(db: sqlite3.Connection, raw_tag: str) -> int:
    """Resolve raw genre code to tag_id via tag_mappings.
    If unknown -- create tag + mapping.

    Семантика регистра: `tag_mappings.raw_tag` хранит вход дословно (FB2-код
    "sf_fantasy" остаётся lowercase для lookup), а `tags.name` нормализуется
    через get_or_create_tag → normalize_tag_name. Lookup raw_tag → tag_id идёт
    через COLLATE NOCASE, поэтому регистр в raw_tag для match не важен.
    """
    row = queries.resolve_raw_tag(db, raw=raw_tag)
    if row:
        return row["tag_id"]
    tag_id = get_or_create_tag(db, raw_tag)
    queries.insert_tag_mapping(db, raw=raw_tag, tid=tag_id)
    return tag_id


def normalize_tag_name(name: str) -> str:
    """Capitalize first letter, leave the rest untouched.

    Special case: if the string is ALL-CAPS and longer than 4 chars, lowercase
    everything after the first letter (SCIENCE FICTION -> Science fiction).
    Acronyms up to 4 chars (AI, SQL, HTTP, REST) are preserved.

    Идемпотентна: повторный вызов на уже нормализованной строке возвращает её
    же без изменений. Применяется в двух слоях независимо: read-path
    (resolve_tag_names — UI-инвариант для unknown raw codes) и write-path
    (get_or_create_tag, map_tag — БД-инвариант на tags.name). Defense in depth:
    каждый слой защищает свой контракт; идемпотентность делает двойной вызов
    безопасным.
    """
    s = name.strip()
    if not s:
        return s
    if len(s) > 4 and s == s.upper() and any(c.isalpha() for c in s):
        return s[0] + s[1:].lower()
    return s[0].upper() + s[1:]


def resolve_tag_names(db: sqlite3.Connection, raw_tags: list[str]) -> list[str]:
    """Resolve raw genre codes to human-readable tag names.
    Unknown tags pass through as-is (with first letter capitalized)."""
    if not raw_tags:
        return []
    seen: set[str] = set()
    result = []
    for raw in raw_tags:
        row = queries.resolve_tag_name(db, raw=raw)
        name = row["name"] if row else normalize_tag_name(raw)
        if name not in seen:
            seen.add(name)
            result.append(name)
    return result


def map_tag(db: sqlite3.Connection, tag_id: int, target_name: str) -> TagMapResult:
    """Map tag to target (rename or merge).

    Returns {"renamed": bool, "target_id": int}.

    Нормализует target_name через normalize_tag_name — write-path инвариант
    (tags.name всегда Capitalized) держится одинаково и на create-path
    (get_or_create_tag), и на rename-path (этот метод).
    """
    target_name = normalize_tag_name(target_name)
    existing = queries.map_tag_check_existing(db, name=target_name, id=tag_id)

    if existing:
        target_id = existing["id"]
        # Remember source name for tag_mappings before deleting
        source_row = queries.get_tag_name_by_id(db, id=tag_id)
        source_name = source_row["name"] if source_row else None
        queries.insert_book_tags_from_source(db, target=target_id, source=tag_id)
        queries.delete_book_tags_by_source(db, source=tag_id)
        queries.update_tag_mappings_target(db, target=target_id, source=tag_id)
        # Add mapping from source name so future imports resolve correctly
        if source_name:
            queries.insert_tag_mapping(db, raw=source_name, tid=target_id)
        queries.delete_tag_by_id(db, source=tag_id)
        return {"renamed": False, "target_id": target_id}
    else:
        queries.update_tag_name(db, name=target_name, id=tag_id)
        return {"renamed": True, "target_id": tag_id}


def get_or_create_tag(db: sqlite3.Connection, name: str) -> int:
    """Single write-path entry for tag creation. Normalizes via normalize_tag_name
    so the invariant «tag names start with uppercase» holds in the tags table
    regardless of how the caller (FB2/EPUB parser, edit form, raw-code
    self-mapping) supplied the value."""
    normalized = normalize_tag_name(name)
    queries.insert_or_ignore_tag(db, name=normalized)
    row = queries.get_tag_id_by_name(db, name=normalized)
    return row["id"]


def tag_exists(db: sqlite3.Connection, tag_id: int) -> bool:
    return queries.tag_exists(db, id=tag_id) is not None


def get_tag_name(db: sqlite3.Connection, tag_id: int) -> str | None:
    row = queries.get_tag_name_by_id(db, id=tag_id)
    return row["name"] if row else None


def rename_tag(db: sqlite3.Connection, tag_id: int, name: str) -> None:
    """Rename tag to `name`. Caller is responsible for normalization and
    existence checks — DAL is the thin SQL layer (симметрично dal.rename_series)."""
    queries.update_tag_name(db, name=name, id=tag_id)


def merge_tag(db: sqlite3.Connection, target_id: int, source_id: int) -> None:
    """Merge source tag into target: move book references, remap raw_tag
    mappings, delete source. Caller is responsible for existence/self-merge
    checks — DAL is the thin SQL layer (симметрично dal.merge_series).

    Mappings strategy mirrors existing dal.map_tag merge branch:
    1. Read source name (для insert mapping ниже).
    2. Move book_tags rows source → target (INSERT OR IGNORE для дубликатов).
    3. Delete remaining source book_tags rows.
    4. Remap existing tag_mappings rows from source to target.
    5. Insert mapping source_name → target (если source имел имя) — future
       FB2 imports того же имени разрешаются в target.
    6. Delete source tag row.
    """
    source_row = queries.get_tag_name_by_id(db, id=source_id)
    source_name = source_row["name"] if source_row else None
    queries.insert_book_tags_from_source(db, target=target_id, source=source_id)
    queries.delete_book_tags_by_source(db, source=source_id)
    queries.update_tag_mappings_target(db, target=target_id, source=source_id)
    if source_name:
        queries.insert_tag_mapping(db, raw=source_name, tid=target_id)
    queries.delete_tag_by_id(db, source=source_id)


def delete_tag(db: sqlite3.Connection, tag_id: int) -> None:
    """Delete tag if it has no books.

    Raises:
        NotFoundError: тег не существует.
        BadInputError: у тега есть книги (cascade-удаление запрещено).

    Структурно симметрично dal.delete_series/dal.delete_author: проверки
    в DAL, service делает чистую делегацию. Дополнительный шаг —
    зачистка tag_mappings перед удалением тега (без cascade-FK).
    """
    if not queries.tag_exists(db, id=tag_id):
        raise NotFoundError("Тег не найден")
    count = queries.count_tag_books(db, id=tag_id)["c"]
    if count > 0:
        raise BadInputError("Нельзя удалить тег с книгами")
    queries.delete_tag_mappings_by_target(db, target=tag_id)
    queries.delete_tag_by_id(db, source=tag_id)

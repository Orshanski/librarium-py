"""Общие `TypeAdapter`-ы для парсинга JSON-полей из SQLite в python-структуры
после `cur.fetchall()`. Используются во всех DAL-функциях, читающих
агрегаты `authors`/`tags`/`series`."""
from pydantic import TypeAdapter

from ..dtos._refs import AuthorRef, TagRef, SeriesRef

AUTHOR_LIST = TypeAdapter(list[AuthorRef])
TAG_LIST = TypeAdapter(list[TagRef])
SERIES_REF = TypeAdapter(SeriesRef | None)


def parse_book_row_aggregates(row: dict) -> None:
    """Разбирает JSON-поля `authors`/`tags`/`series` строки на месте, мутируя `row`.

    Применяется после `cur.fetchall()` для каждой строки из SQL, который
    использует `json_group_array`/`json_object` для этих полей. Если SQL
    не возвращает поле — оно не трогается.
    """
    # По спеке §4: json_group_array на пустом наборе возвращает '[]' — задокументированное
    # поведение SQLite, не fallback. `or '[]'` ниже (для authors и tags) — защита от дрейфа:
    # если будущий SQL-запрос вдруг вернёт NULL или пустую строку, это предотвращает
    # падение JSON-парсера.
    if "authors" in row:
        row["authors"] = AUTHOR_LIST.validate_json(row["authors"] or "[]")
    if "tags" in row:
        row["tags"] = TAG_LIST.validate_json(row["tags"] or "[]")
    if "series" in row:
        # SQL: CASE WHEN s.id IS NULL THEN NULL ELSE json_object(...) END
        # → row['series'] либо SQL NULL (Python None), либо JSON-строка с объектом.
        row["series"] = SERIES_REF.validate_json(row["series"]) if row["series"] is not None else None

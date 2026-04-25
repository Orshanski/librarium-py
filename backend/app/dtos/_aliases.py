"""Snake_case → camelCase alias generator и общие ConfigDict-пресеты для Pydantic-моделей."""
from pydantic import ConfigDict


def to_camel(s: str) -> str:
    """Преобразовать snake_case в camelCase. Идемпотентен для уже camelCase.

    Пустые части после split (ведущие/замыкающие/двойные underscores) отфильтровываются,
    поэтому поведение определено: "__foo" -> "foo", "foo_" -> "foo", "foo__bar" -> "fooBar".
    """
    parts = [p for p in s.split("_") if p]
    if not parts:
        return ""
    return parts[0] + "".join(p.title() for p in parts[1:])


BODY_CONFIG = ConfigDict(populate_by_name=False, alias_generator=to_camel, extra="forbid")
"""Пресет для input body-моделей: strict camel wire (alias_generator), snake Python,
no unknown fields (extra=forbid). Используется в UpdateBookBody, RenameBody, MergeBody,
MapBody (с дополнительным str_strip_whitespace), ShelfBody, ShelfBookBody."""

RESPONSE_CONFIG = ConfigDict(populate_by_name=True, alias_generator=to_camel)
"""Пресет для response-моделей: camelCase wire (alias_generator), snake Python fields,
populate_by_name=True позволяет конструировать через snake kwargs из сервисного слоя."""

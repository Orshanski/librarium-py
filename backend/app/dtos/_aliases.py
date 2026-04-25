"""Snake_case → camelCase alias generator for Pydantic models."""


def to_camel(s: str) -> str:
    """Преобразовать snake_case в camelCase. Идемпотентен для уже camelCase.

    Пустые части после split (ведущие/замыкающие/двойные underscores) отфильтровываются,
    поэтому поведение определено: "__foo" -> "foo", "foo_" -> "foo", "foo__bar" -> "fooBar".
    """
    parts = [p for p in s.split("_") if p]
    if not parts:
        return ""
    return parts[0] + "".join(p.title() for p in parts[1:])

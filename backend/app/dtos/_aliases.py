"""Snake_case → camelCase alias generator for Pydantic models."""


def to_camel(s: str) -> str:
    """Преобразовать snake_case в camelCase. Идемпотентен для уже camelCase."""
    parts = s.split("_")
    if len(parts) == 1:
        return s
    return parts[0] + "".join(p.title() for p in parts[1:])

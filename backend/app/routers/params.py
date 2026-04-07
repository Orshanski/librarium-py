"""Shared query parameter parsers for routers."""


def parse_ids(raw: str) -> list[int] | None:
    """Parse comma-separated ID string to int list. Returns None if empty."""
    if not raw:
        return None
    ids = [int(x.strip()) for x in raw.split(",") if x.strip().isdigit()]
    return ids or None

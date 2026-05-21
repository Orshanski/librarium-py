from pathlib import Path
from typing import Any

from .queries import Queries as Queries

class SQLLoadException(Exception): ...
class SQLParseException(Exception): ...

def from_path(
    sql_path: str | Path,
    driver_adapter: str | Any,
    record_classes: dict[str, Any] | None = ...,
    kwargs_only: bool = ...,
    mandatory_parameters: bool = ...,
    attribute: str | None = ...,
    args: list[Any] = ...,
    kwargs: dict[str, Any] = ...,
    loader_cls: Any = ...,
    queries_cls: Any = ...,
    ext: tuple[str, ...] = ...,
    encoding: str | None = ...,
) -> Queries: ...

def from_str(
    sql: str,
    driver_adapter: str | Any,
    record_classes: dict[str, Any] | None = ...,
    kwargs_only: bool = ...,
    mandatory_parameters: bool = ...,
) -> Queries: ...

def register_adapter(adapter_name: str, adapter: Any) -> None: ...

"""Shared Pydantic v2 Annotated types для router-level validation.

Reusable types для тех случаев, когда один pattern/constraint используется
в нескольких endpoint'ах (query/path/body). Держать здесь, чтобы не
дублировать regex/constraints и ловить drift.
"""
from ..dtos._types import TempIdStr  # canonical definition; re-exported for router imports

__all__ = ["TempIdStr"]

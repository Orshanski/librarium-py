"""Unit tests for the three router-layer helpers introduced in E3."""
import pytest
from fastapi import HTTPException

from app.routers._helpers import (
    require_exists,
    raise_delete_error,
    guard_self_merge,
)


class TestRequireExists:
    def test_truthy_passes(self):
        # Should not raise.
        require_exists(True)
        require_exists({"id": 1})
        require_exists([1])

    def test_falsy_raises_404_with_default_detail(self):
        with pytest.raises(HTTPException) as exc:
            require_exists(False)
        assert exc.value.status_code == 404
        assert exc.value.detail == "Not found"

    def test_falsy_raises_404_with_custom_detail(self):
        with pytest.raises(HTTPException) as exc:
            require_exists(None, detail="Автор не найден")
        assert exc.value.status_code == 404
        assert exc.value.detail == "Автор не найден"


class TestRaiseDeleteError:
    def test_none_returns_silently(self):
        # Success code — no raise.
        raise_delete_error(None, not_found_detail="x", has_books_detail="y")

    def test_empty_string_returns_silently(self):
        raise_delete_error("", not_found_detail="x", has_books_detail="y")

    def test_not_found_raises_404(self):
        with pytest.raises(HTTPException) as exc:
            raise_delete_error(
                "not_found",
                not_found_detail="Автор не найден",
                has_books_detail="has books",
            )
        assert exc.value.status_code == 404
        assert exc.value.detail == "Автор не найден"

    def test_has_books_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            raise_delete_error(
                "has_books",
                not_found_detail="nf",
                has_books_detail="Нельзя удалить автора с книгами",
            )
        assert exc.value.status_code == 400
        assert exc.value.detail == "Нельзя удалить автора с книгами"

    def test_unknown_code_returns_silently(self):
        # Forward-compat: unknown DAL codes don't raise — they fall through
        # to "success" like None. Prevents future DAL additions from breaking
        # the router unexpectedly. Test is a snapshot of this design choice.
        raise_delete_error("some_future_code", not_found_detail="x", has_books_detail="y")


class TestGuardSelfMerge:
    def test_different_ids_pass(self):
        guard_self_merge(1, 2, detail="cannot merge into self")

    def test_same_id_raises_400(self):
        with pytest.raises(HTTPException) as exc:
            guard_self_merge(5, 5, detail="Нельзя объединить с самим собой")
        assert exc.value.status_code == 400
        assert exc.value.detail == "Нельзя объединить с самим собой"

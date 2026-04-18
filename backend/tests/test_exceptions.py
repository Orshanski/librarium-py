"""Unit tests for canonical domain exceptions."""
from app.exceptions import (
    AuthError, BadInputError, ConflictError, ForbiddenError,
    NotFoundError, RateLimitError, UpstreamError,
)


class TestInheritance:
    def test_bad_input_is_value_error(self):
        assert isinstance(BadInputError("x"), ValueError)

    def test_not_found_is_lookup_error(self):
        assert isinstance(NotFoundError("x"), LookupError)

    def test_not_found_is_not_key_error(self):
        assert not isinstance(NotFoundError("x"), KeyError)

    def test_not_found_is_not_index_error(self):
        assert not isinstance(NotFoundError("x"), IndexError)

    def test_conflict_is_file_exists_error(self):
        assert isinstance(ConflictError("x"), FileExistsError)

    def test_forbidden_is_permission_error(self):
        assert isinstance(ForbiddenError("x"), PermissionError)

    def test_auth_is_exception_only(self):
        assert isinstance(AuthError("x"), Exception)
        assert not isinstance(AuthError("x"), LookupError)
        assert not isinstance(AuthError("x"), ValueError)

    def test_rate_limit_is_exception_only(self):
        assert isinstance(RateLimitError("x"), Exception)
        assert not isinstance(RateLimitError("x"), ValueError)

    def test_upstream_is_exception_only(self):
        assert isinstance(UpstreamError("x"), Exception)
        assert not isinstance(UpstreamError("x"), ValueError)


class TestStr:
    def test_str_returns_message(self):
        assert str(BadInputError("bad")) == "bad"
        assert str(NotFoundError("missing")) == "missing"
        assert str(ConflictError("dup")) == "dup"
        assert str(AuthError("denied")) == "denied"

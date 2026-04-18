"""Canonical domain exceptions для Librarium.

Семь классов — один на HTTP статус. Наследование от builtin (где оно есть)
сохраняет совместимость с `except ValueError|LookupError|...` в сервисах, но
middleware ловит только custom-типы — случайный `raise ValueError(...)` НЕ
превратится в 400.
"""


class BadInputError(ValueError):
    """Domain validation error — malformed input или нарушение business-rule. → 400."""


class NotFoundError(LookupError):
    """Domain entity не найдена. → 404.

    Наследование от LookupError, но НЕ от KeyError/IndexError — handler на
    NotFoundError не ловит случайный dict/list lookup в коде.
    """


class ConflictError(FileExistsError):
    """Domain conflict — entity существует / duplicate / rule violation. → 409."""


class ForbiddenError(PermissionError):
    """Access denied доменной политикой. → 403.

    Отличается от AuthError: ForbiddenError — 'знаю кто ты, нельзя',
    AuthError — 'не знаю кто ты' / 'токен невалиден'.
    """


class AuthError(Exception):
    """Authentication failure — нет/невалидный токен, credentials. → 401."""


class RateLimitError(Exception):
    """Rate limit hit (login throttle etc.). → 429."""


class UpstreamError(Exception):
    """Upstream service failure — metadata cover fetch connection/timeout/redirect. → 502."""

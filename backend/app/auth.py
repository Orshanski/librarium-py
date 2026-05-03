import logging
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Literal

import bcrypt
import jwt
from fastapi import Depends, Request

from .config import SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_HOURS, JWT_REFRESH_AFTER_HOURS, COOKIE_NAME
from .exceptions import AuthError, ForbiddenError

log = logging.getLogger("librarium.auth")

_INVALID_TOKEN = "Invalid token"

UserRole = Literal["admin", "reader"]


@dataclass(frozen=True)
class CurrentUser:
    """Typed auth context: the user making the current request.

    Constructed from a decoded JWT payload via `from_payload`. Frozen so
    handlers cannot mutate it mid-request. JWT keys (``userId`` → ``user_id``,
    ``role`` → ``role``) are mapped inside ``from_payload``; consumers read
    the typed attributes, not the raw payload. Extra payload keys
    (e.g. ``iat``, ``exp``) are ignored.

    Precondition: the caller has already verified the JWT signature via
    ``decode_token``. ``from_payload`` only validates payload shape, not
    authenticity.

    Client-visible error contract: any shape violation raises a generic
    ``AuthError("Invalid token")``. The specific malformed-reason is logged
    at WARNING via the ``librarium.auth`` logger for ops diagnostics, but
    never leaks to the client response body.

    Adding a role: extend ``UserRole`` first, then update JWT-issuing
    code (``create_token``) to emit it. Runtime accepts any non-empty
    string; ``UserRole`` is the source of truth for downstream
    ``user.role == "<new>"`` comparisons.
    """

    user_id: int
    role: UserRole

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "CurrentUser":
        if "userId" not in payload:
            log.warning("JWT malformed: userId missing")
            raise AuthError(_INVALID_TOKEN)
        user_id = payload["userId"]
        # bool-guard: Python treats `bool` as `int` subclass — without this,
        # True / False would pass the int check.
        if isinstance(user_id, bool) or not isinstance(user_id, int):
            log.warning("JWT malformed: userId not int (got %s)", type(user_id).__name__)
            raise AuthError(_INVALID_TOKEN)
        if "role" not in payload:
            log.warning("JWT malformed: role missing")
            raise AuthError(_INVALID_TOKEN)
        role = payload["role"]
        if not isinstance(role, str):
            log.warning("JWT malformed: role not string (got %s)", type(role).__name__)
            raise AuthError(_INVALID_TOKEN)
        if not role:
            log.warning("JWT malformed: role empty")
            raise AuthError(_INVALID_TOKEN)
        # Runtime intentionally accepts any non-empty string so unexpected JWT
        # roles produce ForbiddenError downstream (in require_admin / route
        # guards), not AuthError here. Literal is type-level only; the ignore
        # documents the deliberate runtime widening of the nominal type.
        return cls(user_id=user_id, role=role)  # type: ignore[arg-type]


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# --- Token revocation (per-user epoch) ---
#
# Persistent: column users.token_epoch. Bumped only when admin changes a user's role.
# Hot path: in-memory dict[user_id, epoch], lazily populated. In managed
# db_session flows, bump registers post-commit invalidation; the next request
# from that user re-reads the authoritative DB value and re-fills the cache.
# Invalidation must happen after commit so a concurrent pre-commit reader cannot
# repopulate the old epoch and make it authoritative after the bump commits.

_token_epoch_cache: dict[int, int] = {}
_token_epoch_cache_lock = threading.Lock()
_token_epoch_cache_initialized = False
_TOKEN_EPOCH_LEGACY_MODE = False  # set True if column missing — auth runs without revocation


def _ensure_token_epoch_cache_initialized() -> None:
    """Load all (user_id, token_epoch) into cache once per process. Idempotent.

    If users.token_epoch column does not exist (pre-migration), enters legacy mode:
    cache stays empty and revocation checks are skipped, so auth keeps working.

    Legacy mode is sticky for the process lifetime: applying the migration after
    startup will NOT reactivate revocation until the process is restarted. This
    is intentional — re-checking on every request would mean a per-request DB
    hit, which is the regression we are explicitly avoiding. Operations contract:
    run scripts/add_token_epoch_column.py BEFORE deploying the app, and restart
    the service if migration is applied to a running process.
    """
    global _token_epoch_cache_initialized, _TOKEN_EPOCH_LEGACY_MODE
    if _token_epoch_cache_initialized:
        return
    with _token_epoch_cache_lock:
        if _token_epoch_cache_initialized:
            return
        from .database import _get_db
        db = _get_db()
        try:
            cur = db.execute("SELECT id, token_epoch FROM users")
            for row in cur.fetchall():
                _token_epoch_cache[row["id"]] = row["token_epoch"]
        except sqlite3.OperationalError as exc:
            if "no such column" in str(exc).lower():
                log.error("Auth: users.token_epoch column missing — JWT revocation "
                          "is DISABLED for this process. Run "
                          "scripts/add_token_epoch_column.py and restart uvicorn.")
                _TOKEN_EPOCH_LEGACY_MODE = True
            else:
                raise
        _token_epoch_cache_initialized = True


def _fetch_token_epoch(user_id: int) -> int | None:
    """One-shot read of users.token_epoch for a single user. Used on cache miss
    after invalidation. None means user does not exist or column is missing.

    Only "no such column" is swallowed (legacy/pre-migration mode). Other
    OperationalError flavours (e.g. "database is locked") propagate so we never
    silently disable the revocation security control under transient SQLite
    pressure.
    """
    from .database import _get_db
    try:
        cur = _get_db().execute("SELECT token_epoch FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        return row[0] if row is not None else None
    except sqlite3.OperationalError as exc:
        if "no such column" in str(exc).lower():
            return None
        raise


def bump_token_epoch(db: sqlite3.Connection, user_id: int) -> int | None:
    """Increment users.token_epoch and invalidate the cache entry. Returns new epoch.

    Call from admin-side flows that should invalidate the user's outstanding JWTs
    (role change, password reset, forced logout).

    Cache strategy: pop after commit, not write-on-bump — the next request from
    `user_id` re-reads the authoritative DB value. This is both rollback-safe
    and race-safe: aborted transactions never invalidate, while committed bumps
    clear any old epoch that a concurrent pre-commit reader may have cached.

    Returns None if the user_id is not in the table.
    """
    cur = db.execute(
        "UPDATE users SET token_epoch = token_epoch + 1 WHERE id = ? RETURNING token_epoch",
        (user_id,),
    )
    row = cur.fetchone()
    if row is None:
        return None
    new_epoch = row[0]

    def invalidate_cache() -> None:
        with _token_epoch_cache_lock:
            _token_epoch_cache.pop(user_id, None)

    from .database import add_after_commit_hook
    if not add_after_commit_hook(db, invalidate_cache):
        invalidate_cache()
    return new_epoch


def reset_token_epoch_cache_for_tests() -> None:
    """Test-only: clear cache and force re-init on next access."""
    global _token_epoch_cache_initialized
    with _token_epoch_cache_lock:
        _token_epoch_cache.clear()
        _token_epoch_cache_initialized = False


def create_token(user_id: int, role: str, token_epoch: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "userId": user_id,
        "role": role,
        "tep": token_epoch,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])


def get_current_user(request: Request) -> CurrentUser:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise AuthError("Not authenticated")
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        log.warning("JWT decode failed: expired signature")
        raise AuthError("Token expired")
    except jwt.InvalidTokenError as exc:
        log.warning("JWT decode failed: %s", type(exc).__name__)
        raise AuthError(_INVALID_TOKEN)

    user = CurrentUser.from_payload(payload)

    _ensure_token_epoch_cache_initialized()
    jwt_epoch = payload.get("tep", 0)
    if not _TOKEN_EPOCH_LEGACY_MODE:
        cached_epoch = _token_epoch_cache.get(user.user_id)
        if cached_epoch is None:
            # Cache miss: either user created post-init or entry was invalidated by
            # a recent bump. Read once from authoritative DB and repopulate cache.
            cached_epoch = _fetch_token_epoch(user.user_id)
            if cached_epoch is not None:
                with _token_epoch_cache_lock:
                    _token_epoch_cache[user.user_id] = cached_epoch
        if cached_epoch is not None and jwt_epoch != cached_epoch:
            # Mismatch may be a real revocation OR a stale cache. Race scenario:
            # admin's bump pops cache while their UPDATE is still uncommitted; a
            # concurrent reader fills cache with the pre-commit (old) value via
            # SQLite isolation; admin then commits NEW. Cache is stuck at OLD,
            # legitimate fresh JWTs (tep=NEW) get rejected. To self-heal: re-read
            # the authoritative DB once on mismatch and update cache. Only then
            # decide. Cost: at most one extra SELECT per actually-mismatched
            # request — rare, never on the steady-state hot path.
            fresh_epoch = _fetch_token_epoch(user.user_id)
            if fresh_epoch is not None:
                with _token_epoch_cache_lock:
                    _token_epoch_cache[user.user_id] = fresh_epoch
                if fresh_epoch == jwt_epoch:
                    cached_epoch = fresh_epoch  # accept; cache repaired
                else:
                    log.info("Auth: token revoked (epoch mismatch) user_id=%s jwt=%s db=%s",
                             user.user_id, jwt_epoch, fresh_epoch)
                    raise AuthError(_INVALID_TOKEN)
            else:
                log.info("Auth: token revoked (epoch mismatch) user_id=%s jwt=%s cache=%s",
                         user.user_id, jwt_epoch, cached_epoch)
                raise AuthError(_INVALID_TOKEN)

    if token_needs_refresh(payload):
        request.state._refresh_token = True
        request.state._refresh_user_id = user.user_id
        request.state._refresh_role = user.role
        request.state._refresh_epoch = jwt_epoch
    return user


def token_needs_refresh(payload: dict[str, Any]) -> bool:
    """Check if token is older than JWT_REFRESH_AFTER_HOURS."""
    iat = payload.get("iat")
    if not iat:
        return False
    # iat is stored as datetime in create_token but PyJWT decodes it as unix timestamp
    issued_at = datetime.fromtimestamp(iat, tz=timezone.utc)
    age = datetime.now(timezone.utc) - issued_at
    return age > timedelta(hours=JWT_REFRESH_AFTER_HOURS)


def get_client_ip(request: Request) -> str:
    return (
        request.headers.get("X-Real-IP")
        or request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )


def require_admin(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    if user.role != "admin":
        raise ForbiddenError("Admin access required")
    return user

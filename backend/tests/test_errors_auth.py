"""Gap-coverage for auth error paths: rate limit."""
from tests._helpers import assert_error


def test_login_rate_limit_returns_429(anon_client):
    """5 failed attempts from one IP → 6th returns 429."""
    # Clear shared state (rate-limiter is a module-level global)
    from app.services.auth_service import _login_attempts
    _login_attempts.clear()

    for _ in range(5):
        resp = anon_client.post("/api/auth/login",
                                json={"username": "admin", "password": "wrong"})
        assert_error(resp, 401)

    resp = anon_client.post("/api/auth/login",
                            json={"username": "admin", "password": "wrong"})
    assert_error(resp, 429, message_matches="too many")

    _login_attempts.clear()

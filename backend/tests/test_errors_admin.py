"""Admin users error paths incl. business rules."""
from tests._helpers import assert_error


def test_reader_cannot_list_users(reader_client):
    assert_error(reader_client.get("/api/admin/users"), 403)


def test_reader_cannot_create_user(reader_client):
    assert_error(
        reader_client.post("/api/admin/users",
                           json={"username": "x", "password": "pppp"}),
        403,
    )


def test_anon_cannot_access_admin(anon_client):
    assert_error(anon_client.get("/api/admin/users"), 401)


def test_cannot_delete_self(admin_client):
    """Admin cannot delete their own account (business rule)."""
    me = admin_client.get("/api/auth/me").json()
    resp = admin_client.delete(f"/api/admin/users/{me['id']}")
    assert_error(resp, 400, message_matches="самого себя")


def test_cannot_change_own_role(admin_client):
    """Admin cannot change their own role (business rule)."""
    me = admin_client.get("/api/auth/me").json()
    resp = admin_client.put(f"/api/admin/users/{me['id']}",
                            json={"role": "reader"})
    assert_error(resp, 400, message_matches="свою роль")


def test_create_user_invalid_username_is_422(admin_client):
    """Pydantic validation via pattern — FastAPI returns 422 for invalid username."""
    resp = admin_client.post("/api/admin/users",
                             json={"username": "invalid user!", "password": "pppp"})
    assert_error(resp, 422)

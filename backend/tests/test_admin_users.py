"""Admin users API tests."""
from tests._helpers import assert_error, assert_ok, login_client, connect_test_db


def test_create_user(admin_client):
    data = assert_ok(admin_client.post("/api/admin/users", json={
        "username": "newuser",
        "password": "pass1234",
        "role": "reader",
        "displayName": "New User"
    }))
    assert data["id"] > 0


def test_create_user_creates_system_shelves(admin_client):
    data = assert_ok(admin_client.post("/api/admin/users", json={
        "username": "shelfuser",
        "password": "pass1234",
        "role": "reader",
    }))
    user_id = data["id"]

    # Login as new user and check shelves
    c = login_client(username="shelfuser", password="pass1234")
    shelves = assert_ok(c.get("/api/shelves"))["shelves"]
    system_codes = {s["systemCode"] for s in shelves if s["isSystem"]}
    assert system_codes == {"best", "reading_now"}


def test_delete_user_cascade(admin_client):
    db = connect_test_db()

    # Check user 2 has shelves and books before delete
    assert db.execute("SELECT COUNT(*) FROM shelves WHERE user_id = 2").fetchone()[0] > 0
    assert db.execute("SELECT COUNT(*) FROM user_books WHERE user_id = 2").fetchone()[0] > 0
    db.close()

    # Delete user 2
    assert_ok(admin_client.delete("/api/admin/users/2"))

    # Verify cascade: user 2 data cleared
    db = connect_test_db()
    assert db.execute("SELECT COUNT(*) FROM shelves WHERE user_id = 2").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM user_books WHERE user_id = 2").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM users WHERE id = 2").fetchone()[0] == 0
    db.close()


def test_cannot_delete_self(admin_client):
    """Admin cannot delete their own account (business rule)."""
    me = assert_ok(admin_client.get("/api/auth/me"))
    resp = admin_client.delete(f"/api/admin/users/{me['id']}")
    assert_error(resp, 400)


# ── Admin settings ──

def test_get_settings(admin_client):
    data = assert_ok(admin_client.get("/api/admin/settings"))
    assert isinstance(data, dict)


def test_update_settings(admin_client):
    assert_ok(admin_client.put("/api/admin/settings", json={"app_name": "Test Library"}))
    settings = assert_ok(admin_client.get("/api/admin/settings"))
    assert settings["app_name"] == "Test Library"


def test_unknown_setting_ignored(admin_client):
    assert_ok(admin_client.put("/api/admin/settings", json={"evil_key": "hacked"}))
    settings = assert_ok(admin_client.get("/api/admin/settings"))
    assert "evil_key" not in settings


def test_reader_cannot_access_settings(reader_client):
    assert_error(reader_client.get("/api/admin/settings"), 403)

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
    assert data["id"] > 0

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


def test_admin_can_promote_user(admin_client):
    """Promote reader (id=2 in seed) to admin."""
    assert_ok(admin_client.put("/api/admin/users/2", json={"role": "admin"}))
    db = connect_test_db()
    role = db.execute("SELECT role FROM users WHERE id = 2").fetchone()[0]
    db.close()
    assert role == "admin"


def test_admin_can_demote_user(admin_client):
    """Promote then demote reader (id=2)."""
    assert_ok(admin_client.put("/api/admin/users/2", json={"role": "admin"}))
    assert_ok(admin_client.put("/api/admin/users/2", json={"role": "reader"}))
    db = connect_test_db()
    role = db.execute("SELECT role FROM users WHERE id = 2").fetchone()[0]
    db.close()
    assert role == "reader"


def test_role_no_op_for_self_is_accepted(admin_client):
    """Admin sends own current role — accepted (no-op)."""
    me = assert_ok(admin_client.get("/api/auth/me"))
    assert_ok(admin_client.put(f"/api/admin/users/{me['id']}", json={"role": "admin"}))


def test_update_self_with_role_null_is_accepted(admin_client):
    """Self PUT with role=null + other field — passes (exclude_none filters role)."""
    me = assert_ok(admin_client.get("/api/auth/me"))
    assert_ok(admin_client.put(f"/api/admin/users/{me['id']}",
                               json={"role": None, "displayName": "Renamed Admin"}))
    settings_resp = assert_ok(admin_client.get("/api/auth/me"))
    assert settings_resp["displayName"] == "Renamed Admin"


def test_update_user_rejects_empty_password(admin_client):
    """Empty password on update must be rejected (symmetry with create min_length=4)."""
    assert_error(admin_client.put("/api/admin/users/2", json={"password": ""}), 422)


def test_update_user_rejects_short_password(admin_client):
    """Password shorter than 4 chars must be rejected, like on create."""
    assert_error(admin_client.put("/api/admin/users/2", json={"password": "ab"}), 422)


def test_update_user_accepts_valid_password(admin_client):
    """Valid-length password update actually changes the password (round-trip via login)."""
    assert_ok(admin_client.put("/api/admin/users/2", json={"password": "newpass123"}))
    c = login_client(username="reader", password="newpass123")
    assert_ok(c.get("/api/auth/me"))


# ── Admin settings ──

def test_get_settings(admin_client):
    data = assert_ok(admin_client.get("/api/admin/settings"))
    assert isinstance(data, dict)


def test_update_settings(admin_client):
    # Task 1 меняет только контракт тела запроса; ответ до Task 3 остаётся snake
    # (extra=allow). camel round-trip ответа проверяется в Task 3.
    assert_ok(admin_client.put("/api/admin/settings", json={"smtpHost": "smtp.test"}))
    settings = assert_ok(admin_client.get("/api/admin/settings"))
    assert settings["smtp_host"] == "smtp.test"


def test_unknown_setting_rejected(admin_client):
    # extra=forbid: неизвестный ключ в body отклоняется, а не игнорируется
    assert_error(admin_client.put("/api/admin/settings", json={"evilKey": "hacked"}), 422)


def test_settings_body_rejects_snake_case(admin_client):
    # snake-ключи больше не принимаются на проводе (populate_by_name=False)
    assert_error(admin_client.put("/api/admin/settings", json={"smtp_host": "x"}), 422)


def test_app_name_no_longer_accepted(admin_client):
    # app_name удалён из модели + extra=forbid → отклоняется
    assert_error(admin_client.put("/api/admin/settings", json={"appName": "X"}), 422)


def test_create_user_rejects_unknown_field(admin_client):
    assert_error(admin_client.post("/api/admin/users", json={
        "username": "u1", "password": "pass1234", "role": "reader", "bogus": 1,
    }), 422)


def test_reader_cannot_access_settings(reader_client):
    assert_error(reader_client.get("/api/admin/settings"), 403)

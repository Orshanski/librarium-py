import os
import sqlite3


def test_create_user(admin_client):
    resp = admin_client.post("/api/admin/users", json={
        "username": "newuser",
        "password": "pass1234",
        "role": "reader",
        "displayName": "New User"
    })
    assert resp.status_code == 200
    user_id = resp.json()["id"]
    assert user_id > 0


def test_create_user_creates_system_shelves(admin_client):
    resp = admin_client.post("/api/admin/users", json={
        "username": "shelfuser",
        "password": "pass1234",
        "role": "reader",
    })
    user_id = resp.json()["id"]

    # Login as new user and check shelves
    from starlette.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    c.headers.update({"X-Requested-With": "XMLHttpRequest"})
    c.post("/api/auth/login", json={"username": "shelfuser", "password": "pass1234"})

    shelves = c.get("/api/shelves").json()["shelves"]
    system_codes = {s["system_code"] for s in shelves if s["is_system"]}
    assert system_codes == {"best", "reading_now"}


def test_delete_user_cascade(admin_client):
    test_data = os.environ["DATA_DIR"]

    db = sqlite3.connect(os.path.join(test_data, "db.sqlite"))
    assert db.execute("SELECT COUNT(*) FROM shelves WHERE user_id = 2").fetchone()[0] > 0
    assert db.execute("SELECT COUNT(*) FROM user_books WHERE user_id = 2").fetchone()[0] > 0
    db.close()

    resp = admin_client.delete("/api/admin/users/2")
    assert resp.status_code == 200

    db = sqlite3.connect(os.path.join(test_data, "db.sqlite"))
    assert db.execute("SELECT COUNT(*) FROM shelves WHERE user_id = 2").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM user_books WHERE user_id = 2").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM users WHERE id = 2").fetchone()[0] == 0
    db.close()


def test_cannot_delete_self(admin_client):
    resp = admin_client.delete("/api/admin/users/1")
    assert resp.status_code == 400


# ── Admin settings ──

def test_get_settings(admin_client):
    resp = admin_client.get("/api/admin/settings")
    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)


def test_update_settings(admin_client):
    resp = admin_client.put("/api/admin/settings", json={"app_name": "Test Library"})
    assert resp.status_code == 200
    settings = admin_client.get("/api/admin/settings").json()
    assert settings["app_name"] == "Test Library"


def test_unknown_setting_ignored(admin_client):
    resp = admin_client.put("/api/admin/settings", json={"evil_key": "hacked"})
    assert resp.status_code == 200
    settings = admin_client.get("/api/admin/settings").json()
    assert "evil_key" not in settings


def test_reader_cannot_access_settings(reader_client):
    resp = reader_client.get("/api/admin/settings")
    assert resp.status_code == 403

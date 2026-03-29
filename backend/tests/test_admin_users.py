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

def test_login_admin(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    assert resp.json()["user"]["role"] == "admin"
    assert "librarium_token" in resp.cookies


def test_login_reader(client):
    resp = client.post("/api/auth/login", json={"username": "reader", "password": "reader123"})
    assert resp.status_code == 200
    assert resp.json()["user"]["role"] == "reader"


def test_login_wrong_password(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


def test_login_nonexistent_user(client):
    resp = client.post("/api/auth/login", json={"username": "nobody", "password": "test"})
    assert resp.status_code == 401


def test_me_authenticated(admin_token):
    resp = admin_token.get("/api/auth/me")
    assert resp.status_code == 200
    assert resp.json()["username"] == "admin"


def test_me_unauthenticated(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_logout(admin_token):
    resp = admin_token.post("/api/auth/logout")
    assert resp.status_code == 200
    resp = admin_token.get("/api/auth/me")
    assert resp.status_code == 401


def test_reader_cannot_access_admin(reader_token):
    resp = reader_token.get("/api/admin/users")
    assert resp.status_code == 403

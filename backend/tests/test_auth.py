from tests.conftest import PW, auth, login


def test_login_success_and_me(client):
    h = auth(client, "root@test.local")
    me = client.get("/api/v1/auth/me", headers=h).json()
    assert me["email"] == "root@test.local"
    assert "users:manage_users" in me["permissions"]


def test_wrong_password_and_unknown_user_same_error(client):
    a = login(client, "root@test.local", "nope-nope-nope")
    b = login(client, "ghost@test.local", "nope-nope-nope")
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_lockout_after_repeated_failures(client):
    for _ in range(5):
        assert login(client, "fc.a@sample.local", "bad-password-1").status_code == 401
    # Even the correct password is refused while locked.
    assert login(client, "fc.a@sample.local", PW).status_code == 423


def test_no_token_is_401(client):
    assert client.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/projects").status_code == 401


def test_garbage_token_rejected(client):
    assert client.get("/api/v1/auth/me", headers={"Authorization": "Bearer abc.def.ghi"}).status_code == 401


def test_refresh_token_cannot_be_used_as_access(client):
    tok = login(client, "root@test.local").json()
    r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tok['refresh_token']}"})
    assert r.status_code == 401
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": tok["refresh_token"]})
    assert r.status_code == 200


def test_password_change_invalidates_old_tokens(client):
    h = auth(client, "fc.a@sample.local")
    r = client.post("/api/v1/auth/change-password", headers=h,
                    json={"current_password": PW, "new_password": "Brand-New-Pass-77"})
    assert r.status_code == 204
    assert client.get("/api/v1/auth/me", headers=h).status_code == 401
    assert login(client, "fc.a@sample.local", "Brand-New-Pass-77").status_code == 200


def test_deactivated_user_loses_access_immediately(client, admin):
    h = auth(client, "fc.a@sample.local")
    uid = client.get("/api/v1/auth/me", headers=h).json()["id"]
    assert client.patch(f"/api/v1/users/{uid}", headers=admin, json={"is_active": False}).status_code == 200
    assert client.get("/api/v1/auth/me", headers=h).status_code == 401
    assert login(client, "fc.a@sample.local").status_code == 401

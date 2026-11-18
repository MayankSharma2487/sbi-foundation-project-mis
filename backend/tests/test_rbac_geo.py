from sqlalchemy import select

from app.models import Block, District, Role, User, Village
from app.services.rbac import compute_scope, location_in_scope
from tests.conftest import PW, auth


def names(resp):
    return sorted(i["name"] for i in resp.json()["items"])


def test_field_coordinator_sees_only_own_district_tree(client, fc_a):
    assert names(client.get("/api/v1/districts", headers=fc_a)) == ["SAMPLE District A"]
    assert names(client.get("/api/v1/blocks", headers=fc_a)) == ["SAMPLE Block A1"]
    assert names(client.get("/api/v1/villages", headers=fc_a)) == ["SAMPLE Village A1a"]


def test_admin_sees_everything(client, admin):
    assert len(names(client.get("/api/v1/districts", headers=admin))) == 2


def test_field_coordinator_cannot_manage_masters_or_users(client, fc_a):
    st = client.get("/api/v1/states", headers=fc_a).json()["items"][0]["id"]
    assert client.post("/api/v1/districts", headers=fc_a, json={"name": "X", "parent_id": st}).status_code == 403
    assert client.get("/api/v1/users", headers=fc_a).status_code == 403
    assert client.get("/api/v1/audit-logs", headers=fc_a).status_code == 403
    assert client.get("/api/v1/roles", headers=fc_a).status_code == 403


def test_geography_crud_uniqueness_and_archive_guard(client, admin):
    st = client.get("/api/v1/states", headers=admin).json()["items"][0]["id"]
    d = client.post("/api/v1/districts", headers=admin, json={"name": "New D", "parent_id": st})
    assert d.status_code == 201
    did = d.json()["id"]
    assert client.post("/api/v1/districts", headers=admin, json={"name": "New D", "parent_id": st}).status_code == 409
    assert client.post("/api/v1/districts", headers=admin, json={"name": "No Parent"}).status_code == 422
    b = client.post("/api/v1/blocks", headers=admin, json={"name": "B", "parent_id": did})
    assert b.status_code == 201
    assert client.delete(f"/api/v1/districts/{did}", headers=admin).status_code == 409  # has a block
    assert client.delete(f"/api/v1/blocks/{b.json()['id']}", headers=admin).status_code == 204
    assert client.delete(f"/api/v1/districts/{did}", headers=admin).status_code == 204
    assert "New D" not in names(client.get("/api/v1/districts", headers=admin))


def test_project_visibility_scoped_to_assignment(client, admin, fc_a):
    projs = client.get("/api/v1/projects", headers=fc_a).json()
    assert projs["total"] == 1
    # A second project the coordinator is not assigned to must be invisible (404, not 403).
    st = client.get("/api/v1/states", headers=admin).json()["items"][0]["id"]
    p2 = client.post("/api/v1/projects", headers=admin, json={"code": "OTHER-1", "name": "Other", "state_id": st})
    assert p2.status_code == 201
    assert client.get("/api/v1/projects", headers=fc_a).json()["total"] == 1
    assert client.get(f"/api/v1/projects/{p2.json()['id']}", headers=fc_a).status_code == 404
    assert client.get("/api/v1/projects", headers=admin).json()["total"] == 2


def test_project_validation(client, admin):
    st = client.get("/api/v1/states", headers=admin).json()["items"][0]["id"]
    base = {"code": "V-1", "name": "V", "state_id": st}
    assert client.post("/api/v1/projects", headers=admin, json={**base, "status": "bogus"}).status_code == 422
    assert client.post("/api/v1/projects", headers=admin,
                       json={**base, "start_date": "2026-05-01", "end_date": "2026-01-01"}).status_code == 422
    assert client.post("/api/v1/projects", headers=admin, json=base).status_code == 201
    assert client.post("/api/v1/projects", headers=admin, json=base).status_code == 409


def test_assignment_chain_validation(client, admin, db):
    d_a = db.scalar(select(District).where(District.name == "SAMPLE District A"))
    b_b = db.scalar(select(Block).where(Block.name == "SAMPLE Block B1"))
    r = client.post("/api/v1/users", headers=admin, json={
        "email": "bad@example.org", "full_name": "Bad", "password": PW,
        "assignments": [{"role_code": "field_coordinator", "district_id": str(d_a.id), "block_id": str(b_b.id)}]})
    assert r.status_code == 422
    r = client.post("/api/v1/users", headers=admin, json={
        "email": "good@example.org", "full_name": "Good", "password": PW,
        "assignments": [{"role_code": "field_coordinator", "block_id": str(b_b.id)}]})
    assert r.status_code == 201
    assert r.json()["assignments"][0]["district_id"] == str(b_b.district_id)  # derived from block


def test_block_level_user_sees_parent_path_but_not_siblings(client, admin, db):
    from app.models import Block
    d_a = db.scalar(select(District).where(District.name == "SAMPLE District A"))
    extra = client.post("/api/v1/blocks", headers=admin, json={"name": "A2", "parent_id": str(d_a.id)}).json()
    a1 = db.scalar(select(Block).where(Block.name == "SAMPLE Block A1"))
    client.post("/api/v1/users", headers=admin, json={
        "email": "blk@example.org", "full_name": "Blk", "password": PW,
        "assignments": [{"role_code": "field_coordinator", "block_id": str(a1.id)}]})
    h = auth(client, "blk@example.org")
    assert names(client.get("/api/v1/blocks", headers=h)) == ["SAMPLE Block A1"]
    assert names(client.get("/api/v1/districts", headers=h)) == ["SAMPLE District A"]
    assert extra["name"] not in names(client.get("/api/v1/blocks", headers=h))


def test_location_in_scope_is_downward_only(db):
    u = db.scalar(select(User).where(User.email == "fc.a@sample.local"))
    sc = compute_scope(u, "mobilisation:create")
    va = db.scalar(select(Village).where(Village.name == "SAMPLE Village A1a"))
    vb = db.scalar(select(Village).where(Village.name == "SAMPLE Village B1a"))
    assert location_in_scope(db, sc, village_id=va.id)
    assert not location_in_scope(db, sc, village_id=vb.id)


def test_role_permission_edit_takes_effect_and_super_admin_is_fixed(client, admin):
    roles = {r["code"]: r["id"] for r in client.get("/api/v1/roles", headers=admin).json()}
    assert client.put(f"/api/v1/roles/{roles['super_admin']}/permissions", headers=admin,
                      json={"codes": []}).status_code == 409
    assert client.put(f"/api/v1/roles/{roles['field_coordinator']}/permissions", headers=admin,
                      json={"codes": ["nonsense:perm"]}).status_code == 422
    fc = auth(client, "fc.a@sample.local")
    assert client.get("/api/v1/districts", headers=fc).status_code == 200
    ok = client.put(f"/api/v1/roles/{roles['field_coordinator']}/permissions", headers=admin,
                    json={"codes": ["projects:read"]})
    assert ok.status_code == 200
    assert client.get("/api/v1/districts", headers=fc).status_code == 403


def test_audit_trail_records_actions(client, admin):
    st = client.get("/api/v1/states", headers=admin).json()["items"][0]["id"]
    client.post("/api/v1/districts", headers=admin, json={"name": "Audited", "parent_id": st})
    logs = client.get("/api/v1/audit-logs?entity=districts", headers=admin).json()
    assert any(l["action"] == "create" and l["detail"]["name"] == "Audited" for l in logs["items"])
    assert client.get("/api/v1/audit-logs?action=login", headers=admin).json()["total"] >= 1


def test_every_system_role_exists_with_expected_boundaries(db):
    roles = {r.code: {p.code for p in r.permissions} for r in db.scalars(select(Role))}
    assert len(roles) == 9
    assert "pii:read" not in roles["management_viewer"]
    assert "pii:read" not in roles["field_coordinator"]
    assert "users:manage_users" not in roles["project_manager"]
    assert "advances:approve" in roles["finance_officer"]
    assert "budget:read" not in roles["field_coordinator"]

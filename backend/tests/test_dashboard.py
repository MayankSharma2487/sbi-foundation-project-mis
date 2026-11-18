from sqlalchemy import select

from app.models import District
from tests.conftest import auth


def test_dashboard_admin_totals_and_scope(client, admin, fc_a, db):
    s = client.get("/api/v1/dashboard/summary", headers=admin).json()
    assert s["totals"] == {"districts": 2, "blocks": 2, "villages": 2, "projects": 1}
    assert s["projects_by_status"]["active"] == 1
    assert s["users_active"] == 3
    assert [d["villages"] for d in s["by_district"]] == [1, 1]
    f = client.get("/api/v1/dashboard/summary", headers=fc_a).json()
    assert f["totals"] == {"districts": 1, "blocks": 1, "villages": 1, "projects": 1}
    assert f["users_active"] is None  # no users:read -> not disclosed


def test_dashboard_filters_and_scope_enforced(client, admin, fc_a, db):
    da = db.scalar(select(District).where(District.name == "SAMPLE District A"))
    db_ = db.scalar(select(District).where(District.name == "SAMPLE District B"))
    s = client.get(f"/api/v1/dashboard/summary?district_id={da.id}", headers=admin).json()
    assert s["totals"]["districts"] == 1 and s["by_district"][0]["district"] == "SAMPLE District A"
    # Coordinator A may not query District B (404, not a data leak).
    assert client.get(f"/api/v1/dashboard/summary?district_id={db_.id}", headers=fc_a).status_code == 404


def test_dashboard_tracks_live_data(client, admin):
    st = client.get("/api/v1/states", headers=admin).json()["items"][0]["id"]
    before = client.get("/api/v1/dashboard/summary", headers=admin).json()["totals"]["districts"]
    client.post("/api/v1/districts", headers=admin, json={"name": "Live D", "parent_id": st})
    after = client.get("/api/v1/dashboard/summary", headers=admin).json()["totals"]["districts"]
    assert after == before + 1


def test_dashboard_requires_permission(client, admin):
    roles = {r["code"]: r["id"] for r in client.get("/api/v1/roles", headers=admin).json()}
    client.put(f"/api/v1/roles/{roles['trainer']}/permissions", headers=admin, json={"codes": ["projects:read"]})
    client.post("/api/v1/users", headers=admin, json={"email": "t@example.org", "full_name": "T",
                "password": "Correct-Horse-9", "assignments": [{"role_code": "trainer"}]})
    assert client.get("/api/v1/dashboard/summary", headers=auth(client, "t@example.org")).status_code == 403

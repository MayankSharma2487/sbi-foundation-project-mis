from collections import Counter
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require, scope_for
from app.core.db import get_db
from app.models import Block, District, Project, ProjectLocation, User, Village
from app.services.rbac import accessible_ids, compute_scope

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def summary(district_id: UUID | None = None, block_id: UUID | None = None, village_id: UUID | None = None,
            db: Session = Depends(get_db), user=Depends(require("dashboard:read"))):
    """Phase 1 KPIs computed live from the database, restricted to the caller's geography.

    Operational KPIs (mobilisation, revenue, ...) are added with their modules.
    """
    sc = scope_for(user, "dashboard:read")
    vis = accessible_ids(db, sc)  # (districts, blocks, villages) or None = unrestricted

    d_rows = {r.id: r.name for r in db.execute(
        select(District.id, District.name).where(District.is_deleted.is_(False)))}
    b_rows = {r.id: (r.district_id, r.name) for r in db.execute(
        select(Block.id, Block.district_id, Block.name).where(Block.is_deleted.is_(False)))}
    v_rows = {r.id: r.block_id for r in db.execute(
        select(Village.id, Village.block_id).where(Village.is_deleted.is_(False)))}

    D, B, V = set(d_rows), set(b_rows), set(v_rows)
    if vis is not None:
        D &= vis[0]; B &= vis[1]; V &= vis[2]

    filtered = bool(village_id or block_id or district_id)
    if village_id:
        if village_id not in V:
            raise HTTPException(404, "Village not found in your scope")
        V = {village_id}
        B = {v_rows[village_id]} & B
        D = {b_rows[b][0] for b in B}
    elif block_id:
        if block_id not in B:
            raise HTTPException(404, "Block not found in your scope")
        B = {block_id}
        V = {v for v in V if v_rows[v] == block_id}
        D = {b_rows[block_id][0]}
    elif district_id:
        if district_id not in D:
            raise HTTPException(404, "District not found in your scope")
        D = {district_id}
        B = {b for b in B if b_rows[b][0] == district_id}
        V = {v for v in V if v_rows[v] in B}

    by_district = []
    for did in sorted(D, key=lambda x: d_rows[x]):
        blocks = [b for b in B if b_rows[b][0] == did]
        by_district.append({"district_id": did, "district": d_rows[did], "blocks": len(blocks),
                            "villages": sum(1 for v in V if v_rows[v] in blocks)})

    psc = scope_for(user, "projects:read")
    pstmt = select(Project.id, Project.status).where(Project.is_deleted.is_(False))
    if not psc.allowed:
        pstmt = pstmt.where(False)
    elif not psc.all_projects:
        pstmt = pstmt.where(Project.id.in_(psc.project_ids))
    if filtered:
        pstmt = pstmt.where(Project.id.in_(
            select(ProjectLocation.project_id).where(ProjectLocation.district_id.in_(D))))
    status_counts = Counter(r.status for r in db.execute(pstmt))

    out = {
        "totals": {"districts": len(D), "blocks": len(B), "villages": len(V),
                   "projects": sum(status_counts.values())},
        "projects_by_status": {s: status_counts.get(s, 0) for s in ("planned", "active", "completed", "closed")},
        "by_district": by_district,
        "users_active": None,
    }
    if compute_scope(user, "users:read").allowed:
        out["users_active"] = db.scalar(select(func.count()).select_from(User).where(
            User.is_deleted.is_(False), User.is_active.is_(True)))
    return out

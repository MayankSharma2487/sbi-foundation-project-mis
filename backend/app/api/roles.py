from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require
from app.core.db import get_db
from app.models import AuditLog, Permission, Role
from app.schemas.common import AuditOut, Page, PermissionSet, RoleOut
from app.services import audit

router = APIRouter(tags=["administration"])


@router.get("/roles", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db), user=Depends(require("roles:read"))):
    return [RoleOut(id=r.id, code=r.code, name=r.name, is_system=r.is_system)
            for r in db.scalars(select(Role).order_by(Role.name))]


@router.get("/permissions", response_model=list[str])
def list_permissions(db: Session = Depends(get_db), user=Depends(require("roles:read"))):
    return sorted(db.scalars(select(Permission.code)))


@router.get("/roles/{role_id}/permissions", response_model=PermissionSet)
def role_permissions(role_id: UUID, db: Session = Depends(get_db), user=Depends(require("roles:read"))):
    r = db.get(Role, role_id)
    if not r:
        raise HTTPException(404, "Role not found")
    return PermissionSet(codes=sorted(p.code for p in r.permissions))


@router.put("/roles/{role_id}/permissions", response_model=PermissionSet)
def set_role_permissions(role_id: UUID, body: PermissionSet, request: Request, db: Session = Depends(get_db),
                         user=Depends(require("roles:update"))):
    r = db.get(Role, role_id)
    if not r:
        raise HTTPException(404, "Role not found")
    if r.code == "super_admin":
        raise HTTPException(409, "The Super Admin role's permissions are fixed")
    perms = {p.code: p for p in db.scalars(select(Permission))}
    unknown = sorted(set(body.codes) - set(perms))
    if unknown:
        raise HTTPException(422, f"Unknown permissions: {unknown}")
    before = {p.code for p in r.permissions}
    r.permissions = [perms[c] for c in sorted(set(body.codes))]
    after = set(body.codes)
    audit.log(db, user, "update_permissions", "roles", r.id,
              {"added": sorted(after - before), "removed": sorted(before - after)}, client_ip(request))
    db.commit()
    return PermissionSet(codes=sorted(after))


@router.get("/audit-logs", response_model=Page[AuditOut])
def audit_logs(entity: str | None = None, action: str | None = None, user_id: UUID | None = None,
               limit: int = 50, offset: int = 0, db: Session = Depends(get_db),
               user=Depends(require("audit_logs:read"))):
    from sqlalchemy import func
    stmt = select(AuditLog)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(AuditLog.created_at.desc()).limit(min(limit, 200)).offset(offset)).all()
    return Page[AuditOut](items=[AuditOut.model_validate(r) for r in rows], total=total)

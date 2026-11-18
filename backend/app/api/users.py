from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require
from app.core.db import get_db
from app.core.security import hash_password
from app.models import Block, District, Project, Role, User, UserAssignment, Village
from app.schemas.common import AssignmentIn, AssignmentOut, Page, UserCreate, UserOut, UserPatch
from app.services import audit

router = APIRouter(prefix="/users", tags=["users"])


def user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id, email=u.email, full_name=u.full_name, phone=u.phone, is_active=u.is_active,
        last_login_at=u.last_login_at,
        assignments=[AssignmentOut(id=a.id, role_code=a.role.code, project_id=a.project_id,
                                   district_id=a.district_id, block_id=a.block_id, village_id=a.village_id)
                     for a in u.assignments])


def _make_assignment(db: Session, body: AssignmentIn, actor: User) -> UserAssignment:
    role = db.scalar(select(Role).where(Role.code == body.role_code))
    if not role:
        raise HTTPException(422, f"Unknown role: {body.role_code}")
    if body.project_id and not db.get(Project, body.project_id):
        raise HTTPException(422, "Unknown project_id")
    # Geography must be a consistent chain: village -> block -> district.
    if body.village_id:
        v = db.get(Village, body.village_id)
        if not v:
            raise HTTPException(422, "Unknown village_id")
        if body.block_id and body.block_id != v.block_id:
            raise HTTPException(422, "village_id does not belong to block_id")
        body.block_id = v.block_id
    if body.block_id:
        b = db.get(Block, body.block_id)
        if not b:
            raise HTTPException(422, "Unknown block_id")
        if body.district_id and body.district_id != b.district_id:
            raise HTTPException(422, "block_id does not belong to district_id")
        body.district_id = b.district_id
    if body.district_id and not db.get(District, body.district_id):
        raise HTTPException(422, "Unknown district_id")
    return UserAssignment(role=role, project_id=body.project_id, district_id=body.district_id,
                          block_id=body.block_id, village_id=body.village_id,
                          created_by=actor.id, updated_by=actor.id)


@router.get("", response_model=Page[UserOut])
def list_users(q: str | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
               db: Session = Depends(get_db), user=Depends(require("users:read"))):
    stmt = select(User).where(User.is_deleted.is_(False))
    if q:
        stmt = stmt.where(or_(User.email.ilike(f"%{q}%"), User.full_name.ilike(f"%{q}%")))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(User.full_name).limit(limit).offset(offset)).all()
    return Page[UserOut](items=[user_out(u) for u in rows], total=total)


@router.post("", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, request: Request, db: Session = Depends(get_db),
                actor=Depends(require("users:manage_users"))):
    u = User(email=body.email.lower(), full_name=body.full_name, phone=body.phone,
             hashed_password=hash_password(body.password), created_by=actor.id, updated_by=actor.id)
    for a in body.assignments:
        u.assignments.append(_make_assignment(db, a, actor))
    db.add(u)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A user with that email already exists")
    audit.log(db, actor, "create", "users", u.id, {"email": u.email}, client_ip(request))
    db.commit()
    return user_out(u)


def _get(db: Session, user_id: UUID) -> User:
    u = db.get(User, user_id)
    if not u or u.is_deleted:
        raise HTTPException(404, "User not found")
    return u


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: UUID, db: Session = Depends(get_db), actor=Depends(require("users:read"))):
    return user_out(_get(db, user_id))


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: UUID, body: UserPatch, request: Request, db: Session = Depends(get_db),
                actor=Depends(require("users:manage_users"))):
    u = _get(db, user_id)
    data = body.model_dump(exclude_unset=True)
    changed = [k for k in data if k != "password"]
    if "password" in data and data["password"]:
        u.hashed_password = hash_password(data.pop("password"))
        u.token_version += 1
        changed.append("password")
    if data.get("is_active") is False:
        u.token_version += 1  # kill live sessions
    for k in ("full_name", "phone", "is_active"):
        if k in data:
            setattr(u, k, data[k])
    u.updated_by = actor.id
    audit.log(db, actor, "update", "users", u.id, {"fields": changed}, client_ip(request))
    db.commit()
    return user_out(u)


@router.post("/{user_id}/assignments", response_model=UserOut, status_code=201)
def add_assignment(user_id: UUID, body: AssignmentIn, request: Request, db: Session = Depends(get_db),
                   actor=Depends(require("users:manage_users"))):
    u = _get(db, user_id)
    a = _make_assignment(db, body, actor)
    u.assignments.append(a)
    db.flush()
    audit.log(db, actor, "assign", "users", u.id, body.model_dump(mode="json"), client_ip(request))
    db.commit()
    return user_out(u)


@router.delete("/{user_id}/assignments/{assignment_id}", response_model=UserOut)
def remove_assignment(user_id: UUID, assignment_id: UUID, request: Request, db: Session = Depends(get_db),
                      actor=Depends(require("users:manage_users"))):
    u = _get(db, user_id)
    a = next((x for x in u.assignments if x.id == assignment_id), None)
    if not a:
        raise HTTPException(404, "Assignment not found")
    u.assignments.remove(a)
    audit.log(db, actor, "unassign", "users", u.id, {"assignment_id": str(assignment_id)}, client_ip(request))
    db.commit()
    return user_out(u)

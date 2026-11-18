from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require, scope_for
from app.core.db import get_db
from app.models import District, Project, ProjectLocation, State
from app.schemas.common import Page, ProjectIn, ProjectOut, ProjectPatch
from app.services import audit

router = APIRouter(prefix="/projects", tags=["projects"])
STATUSES = {"planned", "active", "completed", "closed"}


def out(p: Project) -> ProjectOut:
    return ProjectOut(id=p.id, code=p.code, name=p.name, donor=p.donor, state_id=p.state_id,
                      start_date=p.start_date, end_date=p.end_date, status=p.status,
                      description=p.description, district_ids=[l.district_id for l in p.locations])


def _check_dates(start, end):
    if start and end and end < start:
        raise HTTPException(422, "end_date cannot be before start_date")


def _visible(db: Session, user, pid: UUID) -> Project:
    p = db.get(Project, pid)
    sc = scope_for(user, "projects:read")
    if not p or p.is_deleted or not (sc.all_projects or pid in sc.project_ids):
        raise HTTPException(404, "Project not found")  # 404 not 403: don't reveal existence
    return p


@router.get("", response_model=Page[ProjectOut])
def list_projects(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                  db: Session = Depends(get_db), user=Depends(require("projects:read"))):
    stmt = select(Project).where(Project.is_deleted.is_(False))
    sc = scope_for(user, "projects:read")
    if not sc.all_projects:
        stmt = stmt.where(Project.id.in_(sc.project_ids))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Project.name).limit(limit).offset(offset)).all()
    return Page[ProjectOut](items=[out(p) for p in rows], total=total)


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectIn, request: Request, db: Session = Depends(get_db),
                   user=Depends(require("projects:create"))):
    if body.status not in STATUSES:
        raise HTTPException(422, f"status must be one of {sorted(STATUSES)}")
    _check_dates(body.start_date, body.end_date)
    if not db.get(State, body.state_id):
        raise HTTPException(422, "Unknown state_id")
    for did in body.district_ids:
        d = db.get(District, did)
        if not d or d.state_id != body.state_id:
            raise HTTPException(422, f"District {did} not found in the project's state")
    p = Project(**body.model_dump(exclude={"district_ids"}), created_by=user.id, updated_by=user.id)
    p.locations = [ProjectLocation(district_id=d, created_by=user.id) for d in dict.fromkeys(body.district_ids)]
    db.add(p)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Project code already exists")
    audit.log(db, user, "create", "projects", p.id, {"code": p.code}, client_ip(request))
    db.commit()
    return out(p)


@router.get("/{pid}", response_model=ProjectOut)
def get_project(pid: UUID, db: Session = Depends(get_db), user=Depends(require("projects:read"))):
    return out(_visible(db, user, pid))


@router.patch("/{pid}", response_model=ProjectOut)
def update_project(pid: UUID, body: ProjectPatch, request: Request, db: Session = Depends(get_db),
                   user=Depends(require("projects:update"))):
    p = _visible(db, user, pid)
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in STATUSES:
        raise HTTPException(422, f"status must be one of {sorted(STATUSES)}")
    _check_dates(data.get("start_date", p.start_date), data.get("end_date", p.end_date))
    for k, v in data.items():
        setattr(p, k, v)
    p.updated_by = user.id
    audit.log(db, user, "update", "projects", p.id, data and {k: str(v) for k, v in data.items()}, client_ip(request))
    db.commit()
    return out(p)


@router.delete("/{pid}", status_code=204)
def archive_project(pid: UUID, request: Request, db: Session = Depends(get_db),
                    user=Depends(require("projects:delete"))):
    p = _visible(db, user, pid)
    p.is_deleted = True
    p.deleted_at = datetime.now(timezone.utc)
    audit.log(db, user, "archive", "projects", p.id, {"code": p.code}, client_ip(request))
    db.commit()


@router.post("/{pid}/locations/{district_id}", response_model=ProjectOut, status_code=201)
def add_location(pid: UUID, district_id: UUID, request: Request, db: Session = Depends(get_db),
                 user=Depends(require("projects:update"))):
    p = _visible(db, user, pid)
    d = db.get(District, district_id)
    if not d or d.is_deleted or d.state_id != p.state_id:
        raise HTTPException(422, "District not found in the project's state")
    if any(l.district_id == district_id for l in p.locations):
        raise HTTPException(409, "District already in project")
    p.locations.append(ProjectLocation(district_id=district_id, created_by=user.id))
    audit.log(db, user, "add_location", "projects", p.id, {"district_id": str(district_id)}, client_ip(request))
    db.commit()
    return out(p)


@router.delete("/{pid}/locations/{district_id}", response_model=ProjectOut)
def remove_location(pid: UUID, district_id: UUID, request: Request, db: Session = Depends(get_db),
                    user=Depends(require("projects:update"))):
    p = _visible(db, user, pid)
    loc = next((l for l in p.locations if l.district_id == district_id), None)
    if not loc:
        raise HTTPException(404, "District not in project")
    p.locations.remove(loc)
    audit.log(db, user, "remove_location", "projects", p.id, {"district_id": str(district_id)}, client_ip(request))
    db.commit()
    return out(p)

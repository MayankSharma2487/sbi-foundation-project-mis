from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require, scope_for
from app.core.db import get_db
from app.models import Block, District, State, Village
from app.schemas.common import GeoIn, GeoOut, GeoPatch, Page
from app.services import audit
from app.services.rbac import accessible_ids
from datetime import datetime, timezone

# name, model, parent attr, parent model, child model/attr (for archive guard), index in accessible_ids
SPECS = [
    ("states", State, None, None, (District, "state_id"), None),
    ("districts", District, "state_id", State, (Block, "district_id"), 0),
    ("blocks", Block, "district_id", District, (Village, "block_id"), 1),
    ("villages", Village, "block_id", Block, None, 2),
]

router = APIRouter(tags=["locations"])


def _build(path, model, parent_attr, parent_model, child, vis_idx):
    def out(o):
        return GeoOut(id=o.id, name=o.name, code=o.code, parent_id=getattr(o, parent_attr) if parent_attr else None)

    @router.get(f"/{path}", response_model=Page[GeoOut], name=f"list_{path}")
    def list_(parent_id: UUID | None = None, q: str | None = None, limit: int = Query(50, ge=1, le=500),
              offset: int = Query(0, ge=0), db: Session = Depends(get_db),
              user=Depends(require("locations:read"))):
        stmt = select(model).where(model.is_deleted.is_(False))
        if vis_idx is not None:
            vis = accessible_ids(db, scope_for(user, "locations:read"))
            if vis is not None:
                stmt = stmt.where(model.id.in_(vis[vis_idx]))
        if parent_id and parent_attr:
            stmt = stmt.where(getattr(model, parent_attr) == parent_id)
        if q:
            stmt = stmt.where(model.name.ilike(f"%{q}%"))
        total = db.scalar(select(func.count()).select_from(stmt.subquery()))
        rows = db.scalars(stmt.order_by(model.name).limit(limit).offset(offset)).all()
        return Page[GeoOut](items=[out(r) for r in rows], total=total)

    @router.post(f"/{path}", response_model=GeoOut, status_code=201, name=f"create_{path}")
    def create(body: GeoIn, request: Request, db: Session = Depends(get_db),
               user=Depends(require("locations:create"))):
        kw = {"name": body.name.strip(), "code": body.code, "created_by": user.id, "updated_by": user.id}
        if parent_attr:
            parent = db.get(parent_model, body.parent_id) if body.parent_id else None
            if not parent or parent.is_deleted:
                raise HTTPException(422, "parent_id is required and must reference an existing parent")
            kw[parent_attr] = body.parent_id
        obj = model(**kw)
        db.add(obj)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, f"A {path[:-1]} with that name or code already exists")
        audit.log(db, user, "create", path, obj.id, {"name": obj.name}, client_ip(request))
        db.commit()
        return out(obj)

    @router.patch(f"/{path}/{{item_id}}", response_model=GeoOut, name=f"update_{path}")
    def update(item_id: UUID, body: GeoPatch, request: Request, db: Session = Depends(get_db),
               user=Depends(require("locations:update"))):
        obj = db.get(model, item_id)
        if not obj or obj.is_deleted:
            raise HTTPException(404, "Not found")
        changes = body.model_dump(exclude_unset=True)
        for k, v in changes.items():
            setattr(obj, k, v)
        obj.updated_by = user.id
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Name or code already in use")
        audit.log(db, user, "update", path, obj.id, changes, client_ip(request))
        db.commit()
        return out(obj)

    @router.delete(f"/{path}/{{item_id}}", status_code=204, name=f"archive_{path}")
    def archive(item_id: UUID, request: Request, db: Session = Depends(get_db),
                user=Depends(require("locations:delete"))):
        obj = db.get(model, item_id)
        if not obj or obj.is_deleted:
            raise HTTPException(404, "Not found")
        if child:
            cmodel, cattr = child
            if db.scalar(select(func.count()).select_from(cmodel).where(
                    getattr(cmodel, cattr) == obj.id, cmodel.is_deleted.is_(False))):
                raise HTTPException(409, "Archive or move the child locations first")
        obj.is_deleted = True
        obj.deleted_at = datetime.now(timezone.utc)
        obj.updated_by = user.id
        audit.log(db, user, "archive", path, obj.id, {"name": obj.name}, client_ip(request))
        db.commit()


for spec in SPECS:
    _build(*spec)

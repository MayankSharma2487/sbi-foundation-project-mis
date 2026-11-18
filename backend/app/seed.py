"""Idempotent seeding: permissions, roles, super admin. `--demo` adds clearly labelled SAMPLE data."""
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Block, District, Permission, Project, ProjectLocation, Role, State, User, UserAssignment, Village
from app.services.rbac import ROLE_NAMES, all_permission_codes, default_role_matrix


def seed_rbac(db: Session) -> None:
    existing = {p.code: p for p in db.scalars(select(Permission))}
    for code in all_permission_codes():
        if code not in existing:
            existing[code] = Permission(code=code)
            db.add(existing[code])
    db.flush()
    matrix = default_role_matrix()
    roles = {r.code: r for r in db.scalars(select(Role))}
    for code, name in ROLE_NAMES.items():
        if code not in roles:  # never overwrite permissions an admin has customised
            roles[code] = Role(code=code, name=name, is_system=True)
            roles[code].permissions = [existing[c] for c in sorted(matrix[code])]
            db.add(roles[code])
    db.commit()


def ensure_superadmin(db: Session, email: str, password: str, name: str = "Super Admin") -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user:
        return user
    role = db.scalar(select(Role).where(Role.code == "super_admin"))
    user = User(email=email.lower(), full_name=name, hashed_password=hash_password(password))
    user.assignments.append(UserAssignment(role=role))
    db.add(user)
    db.commit()
    return user


def seed_demo(db: Session, password: str) -> None:
    """SAMPLE data only. All names are prefixed SAMPLE so it can't be mistaken for project data."""
    if db.scalar(select(State).where(State.name == "SAMPLE State")):
        return
    st = State(name="SAMPLE State", code="SMP")
    db.add(st)
    db.flush()
    places = {}
    for dn in ("A", "B"):
        d = District(state_id=st.id, name=f"SAMPLE District {dn}")
        db.add(d)
        db.flush()
        b = Block(district_id=d.id, name=f"SAMPLE Block {dn}1")
        db.add(b)
        db.flush()
        v = Village(block_id=b.id, name=f"SAMPLE Village {dn}1a")
        db.add(v)
        db.flush()
        places[dn] = (d, b, v)
    proj = Project(code="SAMPLE-001", name="SAMPLE Project (demo data)", state_id=st.id, status="active")
    proj.locations = [ProjectLocation(district_id=places[k][0].id) for k in places]
    db.add(proj)
    db.flush()
    roles = {r.code: r for r in db.scalars(select(Role))}
    for email, role, key in (("fc.a@sample.local", "field_coordinator", "A"),
                             ("fc.b@sample.local", "field_coordinator", "B")):
        u = User(email=email, full_name=f"SAMPLE {role} {key}", hashed_password=hash_password(password))
        u.assignments.append(UserAssignment(role=roles[role], project_id=proj.id, district_id=places[key][0].id))
        db.add(u)
    db.commit()


def main() -> None:
    s = get_settings()
    with SessionLocal() as db:
        seed_rbac(db)
        if s.superadmin_password:
            ensure_superadmin(db, s.superadmin_email, s.superadmin_password, s.superadmin_name)
            print(f"Super admin ready: {s.superadmin_email}")
        else:
            print("SUPERADMIN_PASSWORD not set - no super admin created.")
        if "--demo" in sys.argv:
            if s.environment == "production":
                sys.exit("Refusing to load demo data in production.")
            seed_demo(db, s.superadmin_password or "SampleDemo#12345")
            print("Loaded SAMPLE demo data (not real project data).")


if __name__ == "__main__":
    main()

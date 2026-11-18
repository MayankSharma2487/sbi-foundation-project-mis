"""Permission catalogue, default role matrix, and geographic scope resolution."""
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Block, User, Village

RESOURCES = [
    "dashboard", "projects", "locations", "users", "roles", "settings", "audit_logs",
    "artisans", "mobilisation", "members", "shgs", "assessment", "trainings",
    "sampling", "products", "marketing", "buyers", "revenue",
    "budget", "expenses", "advances", "payments",
    "governance", "shares", "staff", "activities", "challenges", "reports",
]
ACTIONS = ["create", "read", "update", "delete", "approve", "export"]


def all_permission_codes() -> list[str]:
    codes = [f"{r}:{a}" for r in RESOURCES for a in ACTIONS]
    codes += ["users:manage_users", "pii:read"]  # pii:read unmasks Aadhaar/PAN/bank data
    return codes


FIELD_MODULES = [
    "artisans", "mobilisation", "members", "shgs", "assessment", "trainings",
    "sampling", "marketing", "activities", "challenges",
]
FINANCE_MODULES = ["budget", "expenses", "advances", "payments", "revenue", "buyers"]
LOOKUPS = ["dashboard", "projects", "locations", "reports"]


def _p(resources, actions):
    return {f"{r}:{a}" for r in resources for a in actions}


def default_role_matrix() -> dict[str, set[str]]:
    everything = set(all_permission_codes())
    return {
        "super_admin": everything,
        "project_admin": everything - _p(["roles"], ["create", "update", "delete"]),
        "project_manager": (
            _p(FIELD_MODULES + FINANCE_MODULES + ["products", "governance", "shares", "staff"],
               ["create", "read", "update", "approve", "export"])
            | _p(LOOKUPS + ["users"], ["read"]) | {"reports:export", "pii:read"}
        ),
        "mis_executive": (
            _p(FIELD_MODULES + ["products", "staff"], ["create", "read", "update", "export"])
            | _p(FINANCE_MODULES + ["governance", "shares"], ["read"])
            | _p(LOOKUPS, ["read"]) | {"reports:export", "pii:read"}
        ),
        "district_coordinator": (
            _p(FIELD_MODULES, ["create", "read", "update", "export"])
            | _p(LOOKUPS + ["staff"], ["read"])
        ),
        "field_coordinator": (
            _p(FIELD_MODULES, ["create", "read", "update"]) | _p(LOOKUPS, ["read"])
        ),
        "trainer": (
            _p(["trainings", "assessment"], ["create", "read", "update"])
            | _p(["artisans"] + LOOKUPS, ["read"])
        ),
        "finance_officer": (
            _p(FINANCE_MODULES, ["create", "read", "update", "export"])
            | _p(["budget", "expenses", "advances", "payments"], ["approve"])
            | _p(LOOKUPS, ["read"]) | {"reports:export"}
        ),
        "management_viewer": _p(["dashboard", "reports", "projects", "locations"], ["read"]) | {"reports:export"},
    }


ROLE_NAMES = {
    "super_admin": "Super Admin", "project_admin": "Project Admin", "project_manager": "Project Manager",
    "mis_executive": "MIS Executive", "district_coordinator": "District Coordinator",
    "field_coordinator": "Field Coordinator", "trainer": "Trainer",
    "finance_officer": "Finance Officer", "management_viewer": "Management Viewer",
}


@dataclass
class Scope:
    """Geography/project reach a user has for one permission."""

    allowed: bool = False
    all_projects: bool = False
    project_ids: set[UUID] = field(default_factory=set)
    all_geography: bool = False
    district_ids: set[UUID] = field(default_factory=set)
    block_ids: set[UUID] = field(default_factory=set)
    village_ids: set[UUID] = field(default_factory=set)


def compute_scope(user: User, permission: str) -> Scope:
    s = Scope()
    for a in user.assignments:
        if permission not in {p.code for p in a.role.permissions}:
            continue
        s.allowed = True
        if a.project_id is None:
            s.all_projects = True
        else:
            s.project_ids.add(a.project_id)
        if a.district_id is None:
            s.all_geography = True
        elif a.block_id is None:
            s.district_ids.add(a.district_id)
        elif a.village_id is None:
            s.block_ids.add(a.block_id)
        else:
            s.village_ids.add(a.village_id)
    return s


def has_permission(user: User, permission: str) -> bool:
    return compute_scope(user, permission).allowed


def accessible_ids(db: Session, scope: Scope):
    """Return (districts, blocks, villages) the scope can *see*, or None if unrestricted.

    Data access flows downward (district -> its blocks/villages). Parents of an
    assigned block/village are included so dropdowns can show the path, but that
    does not grant access to their siblings.
    """
    if scope.all_geography:
        return None
    d, b, v = set(scope.district_ids), set(scope.block_ids), set(scope.village_ids)
    if d:
        b |= set(db.scalars(select(Block.id).where(Block.district_id.in_(d))))
    if b:
        v |= set(db.scalars(select(Village.id).where(Village.block_id.in_(b))))
    parent_blocks = set(db.scalars(select(Village.block_id).where(Village.id.in_(v)))) if v else set()
    b_all = b | parent_blocks
    d_all = d | (set(db.scalars(select(Block.district_id).where(Block.id.in_(b_all)))) if b_all else set())
    return d_all, b_all, v


def location_in_scope(db: Session, scope: Scope, village_id: UUID | None = None,
                      block_id: UUID | None = None, district_id: UUID | None = None) -> bool:
    """For future modules: may this scope touch a record located here? (data access, downward only)"""
    if scope.all_geography:
        return True
    if village_id:
        v = db.get(Village, village_id)
        if not v:
            return False
        block_id = v.block_id
        if village_id in scope.village_ids:
            return True
    if block_id:
        if block_id in scope.block_ids:
            return True
        blk = db.get(Block, block_id)
        district_id = blk.district_id if blk else None
    if district_id and district_id in scope.district_ids:
        return True
    return False

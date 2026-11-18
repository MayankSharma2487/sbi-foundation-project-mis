from datetime import date, datetime
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class GeoIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str | None = Field(default=None, max_length=20)
    parent_id: UUID | None = None


class GeoPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    code: str | None = Field(default=None, max_length=20)


class GeoOut(BaseModel):
    id: UUID
    name: str
    code: str | None
    parent_id: UUID | None


class ProjectIn(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=200)
    donor: str | None = None
    state_id: UUID
    start_date: date | None = None
    end_date: date | None = None
    status: str = "planned"
    description: str | None = None
    district_ids: list[UUID] = []


class ProjectPatch(BaseModel):
    name: str | None = None
    donor: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: str | None = None
    description: str | None = None


class ProjectOut(ORM):
    id: UUID
    code: str
    name: str
    donor: str | None
    state_id: UUID
    start_date: date | None
    end_date: date | None
    status: str
    description: str | None
    district_ids: list[UUID] = []


class AssignmentIn(BaseModel):
    role_code: str
    project_id: UUID | None = None
    district_id: UUID | None = None
    block_id: UUID | None = None
    village_id: UUID | None = None


class AssignmentOut(BaseModel):
    id: UUID
    role_code: str
    project_id: UUID | None
    district_id: UUID | None
    block_id: UUID | None
    village_id: UUID | None


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    phone: str | None = None
    password: str = Field(min_length=10, max_length=128)
    assignments: list[AssignmentIn] = []


class UserPatch(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=10, max_length=128)


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    phone: str | None
    is_active: bool
    last_login_at: datetime | None
    assignments: list[AssignmentOut]


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshIn(BaseModel):
    refresh_token: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=128)


class MeOut(UserOut):
    permissions: list[str]


class RoleOut(BaseModel):
    id: UUID
    code: str
    name: str
    is_system: bool


class PermissionSet(BaseModel):
    codes: list[str]


class AuditOut(ORM):
    id: UUID
    created_at: datetime
    user_id: UUID | None
    action: str
    entity: str
    entity_id: str | None
    detail: dict | None
    ip: str | None

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Table, Column, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import AuditMixin, Base, SoftDeleteMixin

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Uuid, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", Uuid, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(Base, AuditMixin):
    __tablename__ = "permissions"
    code: Mapped[str] = mapped_column(String(80), unique=True)  # resource:action
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Role(Base, AuditMixin):
    __tablename__ = "roles"
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    permissions: Mapped[list[Permission]] = relationship(secondary=role_permissions, lazy="selectin")


class User(Base, AuditMixin, SoftDeleteMixin):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    assignments: Mapped[list["UserAssignment"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )


class UserAssignment(Base, AuditMixin):
    """A role granted to a user, optionally limited to a project and a geography level.

    NULL project_id = all projects. Geography is the most specific non-NULL level;
    all NULL = project-wide.
    """

    __tablename__ = "user_assignments"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    role_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("roles.id"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("projects.id"), nullable=True)
    district_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("districts.id"), nullable=True)
    block_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("blocks.id"), nullable=True)
    village_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("villages.id"), nullable=True)
    user: Mapped[User] = relationship(back_populates="assignments")
    role: Mapped[Role] = relationship(lazy="selectin")

import uuid
from datetime import date

from sqlalchemy import CheckConstraint, Date, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import AuditMixin, Base, SoftDeleteMixin


class Project(Base, AuditMixin, SoftDeleteMixin):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("status in ('planned','active','completed','closed')", name="status_valid"),
    )
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    donor: Mapped[str | None] = mapped_column(String(200), nullable=True)
    state_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("states.id"), index=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="planned")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    locations: Mapped[list["ProjectLocation"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class ProjectLocation(Base, AuditMixin):
    """Districts a project covers (blocks/villages are reached via the geography tree)."""

    __tablename__ = "project_locations"
    __table_args__ = (UniqueConstraint("project_id", "district_id"),)
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("projects.id"), index=True)
    district_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("districts.id"), index=True)
    project: Mapped[Project] = relationship(back_populates="locations")

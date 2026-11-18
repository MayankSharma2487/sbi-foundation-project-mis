import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import AuditMixin, Base, SoftDeleteMixin


class State(Base, AuditMixin, SoftDeleteMixin):
    __tablename__ = "states"
    name: Mapped[str] = mapped_column(String(120), unique=True)
    code: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)


class District(Base, AuditMixin, SoftDeleteMixin):
    __tablename__ = "districts"
    __table_args__ = (UniqueConstraint("state_id", "name"),)
    state_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("states.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str | None] = mapped_column(String(20), nullable=True)


class Block(Base, AuditMixin, SoftDeleteMixin):
    __tablename__ = "blocks"
    __table_args__ = (UniqueConstraint("district_id", "name"),)
    district_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("districts.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str | None] = mapped_column(String(20), nullable=True)


class Village(Base, AuditMixin, SoftDeleteMixin):
    __tablename__ = "villages"
    __table_args__ = (UniqueConstraint("block_id", "name"),)
    block_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("blocks.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str | None] = mapped_column(String(20), nullable=True)

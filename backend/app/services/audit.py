from sqlalchemy.orm import Session

from app.models import AuditLog, User


def log(db: Session, user: User | None, action: str, entity: str, entity_id=None,
        detail: dict | None = None, ip: str | None = None) -> None:
    """Add an audit row to the current transaction (committed with the change itself)."""
    db.add(AuditLog(
        user_id=user.id if user else None, action=action, entity=entity,
        entity_id=str(entity_id) if entity_id else None, detail=detail, ip=ip,
    ))

from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_token
from app.models import User
from app.services.rbac import Scope, compute_scope

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def current_user(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    err = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token",
                        headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = decode_token(token, "access")
        user = db.get(User, UUID(payload["sub"]))
    except (jwt.PyJWTError, ValueError, KeyError):
        raise err
    if not user or user.is_deleted or not user.is_active or user.token_version != payload.get("ver"):
        raise err
    return user


def require(permission: str):
    """Dependency: authenticated user must hold `permission` via at least one assignment."""

    def dep(user: User = Depends(current_user)) -> User:
        if not compute_scope(user, permission).allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing permission: {permission}")
        return user

    return dep


def scope_for(user: User, permission: str) -> Scope:
    return compute_scope(user, permission)


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None

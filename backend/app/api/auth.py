from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import client_ip, current_user
from app.api.users import user_out
from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import burn_hash, decode_token, hash_password, make_token, verify_password
from app.models import User
from app.schemas.common import MeOut, PasswordChange, RefreshIn, TokenOut
from app.services import audit
from app.services.rbac import all_permission_codes, compute_scope

router = APIRouter(prefix="/auth", tags=["auth"])


def _tokens(user: User) -> TokenOut:
    return TokenOut(access_token=make_token(str(user.id), user.token_version, "access"),
                    refresh_token=make_token(str(user.id), user.token_version, "refresh"))


@router.post("/login", response_model=TokenOut)
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    s = get_settings()
    now = datetime.now(timezone.utc)
    user = db.scalar(select(User).where(User.email == form.username.strip().lower(), User.is_deleted.is_(False)))
    bad = HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user:
        burn_hash(form.password)
        raise bad
    locked = user.locked_until
    if locked is not None and locked.tzinfo is None:
        locked = locked.replace(tzinfo=timezone.utc)
    if locked and locked > now:
        raise HTTPException(status.HTTP_423_LOCKED, "Account temporarily locked. Try again later.")
    if not verify_password(form.password, user.hashed_password) or not user.is_active:
        user.failed_logins += 1
        if user.failed_logins >= s.max_failed_logins:
            user.locked_until = now + timedelta(minutes=s.lockout_minutes)
            user.failed_logins = 0
            audit.log(db, user, "account_locked", "user", user.id, ip=client_ip(request))
        db.commit()
        raise bad
    user.failed_logins = 0
    user.locked_until = None
    user.last_login_at = now
    audit.log(db, user, "login", "user", user.id, ip=client_ip(request))
    db.commit()
    return _tokens(user)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token, "refresh")
        user = db.get(User, UUID(payload["sub"]))
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    if not user or not user.is_active or user.is_deleted or user.token_version != payload.get("ver"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    return _tokens(user)


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(current_user)):
    perms = [c for c in all_permission_codes() if compute_scope(user, c).allowed]
    return MeOut(**user_out(user).model_dump(), permissions=perms)


@router.post("/change-password", status_code=204)
def change_password(body: PasswordChange, request: Request, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.hashed_password = hash_password(body.new_password)
    user.token_version += 1  # invalidates all existing tokens
    audit.log(db, user, "password_change", "user", user.id, ip=client_ip(request))
    db.commit()

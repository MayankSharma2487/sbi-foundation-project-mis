from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import get_settings

ALGO = "HS256"


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode()[:72], hashed.encode())
    except ValueError:
        return False


_DUMMY = hash_password("dummy-password-for-timing")


def burn_hash(pw: str) -> None:
    """Equalise timing when the user does not exist."""
    verify_password(pw, _DUMMY)


def make_token(user_id: str, token_version: int, kind: str) -> str:
    s = get_settings()
    delta = timedelta(minutes=s.access_token_minutes) if kind == "access" else timedelta(days=s.refresh_token_days)
    payload = {
        "sub": user_id,
        "ver": token_version,
        "type": kind,
        "exp": datetime.now(timezone.utc) + delta,
    }
    return jwt.encode(payload, s.secret_key, algorithm=ALGO)


def decode_token(token: str, kind: str) -> dict:
    payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGO])
    if payload.get("type") != kind:
        raise jwt.InvalidTokenError("wrong token type")
    return payload

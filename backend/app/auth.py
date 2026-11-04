import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me")
TOKEN_HOURS = int(os.getenv("JWT_HOURS", "12"))
_bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 120_000).hex()
    return f"{salt}${h}"


def verify_password(pw: str, stored: str) -> bool:
    salt = stored.split("$", 1)[0]
    return hmac.compare_digest(hash_password(pw, salt), stored)


def make_token(user) -> str:
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "name": user.name,
        "role": user.role,
        "staff_id": user.staff_id,
        "patient_id": user.patient_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")


def current_user(cred: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if not cred:
        raise HTTPException(401, "Not authenticated")
    try:
        return jwt.decode(cred.credentials, SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired or invalid token")


def require(*roles):
    def dep(user: dict = Depends(current_user)):
        if user["role"] != "admin" and user["role"] not in roles:
            raise HTTPException(403, "Your role is not permitted to perform this action")
        return user

    return dep

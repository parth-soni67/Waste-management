"""
WasteWise AI — Security Utilities

JWT token creation/validation, password hashing (Argon2id), and
FastAPI dependencies for auth + RBAC enforcement.

Implements security_guide.md §1 (auth) and §2 (authorization).
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from app.core.config import settings

# ---------------------------------------------------------------------------
# Password hashing — Argon2id per security_guide.md §1
# ---------------------------------------------------------------------------

ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MiB
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(password: str) -> str:
    """Hash a plaintext password with Argon2id."""
    return ph.hash(password)


get_password_hash = hash_password


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Constant-time password verification per security_guide.md §1.
    Returns False on mismatch — never reveals which part was wrong.
    """
    try:
        return ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, InvalidHashError):
        return False


# ---------------------------------------------------------------------------
# JWT token management — security_guide.md §1
# Access: short-lived (15 min). Refresh: longer (7 days), rotated.
# ---------------------------------------------------------------------------


class TokenPayload(BaseModel):
    sub: str  # user id
    role: str
    exp: datetime
    jti: str  # unique token ID for revocation tracking
    type: str  # "access" or "refresh"


def create_access_token(
    user_id: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a short-lived JWT access token."""
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire,
        "iat": now,
        "jti": str(uuid.uuid4()),
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(
    user_id: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a longer-lived JWT refresh token."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire,
        "iat": now,
        "jti": str(uuid.uuid4()),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> TokenPayload:
    """
    Decode and validate a JWT token.
    Raises HTTPException 401 on any failure.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return TokenPayload(**payload)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# FastAPI dependencies — auth + RBAC
# ---------------------------------------------------------------------------

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login", auto_error=False
)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> TokenPayload:
    """
    Decode the access token and return the payload.
    Phase 1 will replace this with a full User lookup from the database.
    """
    token_data = decode_token(token)
    if token_data.type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )
    return token_data


async def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme_optional),
) -> Optional[TokenPayload]:
    """
    Optional user dependency. Returns TokenPayload if a valid Bearer token is provided,
    otherwise returns None without raising 401. Useful for public/citizen endpoints.
    """
    if not token:
        return None
    try:
        token_data = decode_token(token)
        if token_data.type != "access":
            return None
        return token_data
    except Exception:
        return None


def require_role(*allowed_roles):
    """
    RBAC dependency factory per security_guide.md §2.
    Usage: `current_user: TokenPayload = Depends(require_role("officer", "admin"))`
    Handles strings, enums, and uppercase/lowercase matching robustly.
    """
    normalized_allowed = {
        r.value.upper() if hasattr(r, "value") else str(r).upper()
        for r in allowed_roles
    }

    async def role_checker(
        current_user: TokenPayload = Depends(get_current_user),
    ) -> TokenPayload:
        user_role_str = str(current_user.role).upper()
        if user_role_str not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return role_checker

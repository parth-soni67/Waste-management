"""
WasteWise AI — Authentication Service

Handles user registration, Argon2id password verification, JWT access & refresh token issuance,
and session revocation tracking via RefreshToken database records and Redis.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.entities import User, UserRole, RefreshToken
from app.schemas.all_schemas import UserRegisterRequest, UserLoginRequest


class AuthService:
    @staticmethod
    async def register_citizen(
        db: AsyncSession, payload: UserRegisterRequest
    ) -> User:
        """Register a new citizen user."""
        # Check if email already exists
        stmt = select(User).where(User.email == payload.email)
        res = await db.execute(stmt)
        if res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already registered",
            )

        new_user = User(
            email=payload.email,
            hashed_password=hash_password(payload.password),
            full_name=payload.full_name,
            phone_number=payload.phone_number,
            role=UserRole.CITIZEN,
            is_active=True,
            is_verified=True,  # Auto-verified for hackathon demo
        )
        db.add(new_user)
        await db.flush()
        return new_user

    @staticmethod
    async def authenticate_user(
        db: AsyncSession, payload: UserLoginRequest
    ) -> Tuple[User, str, str]:
        """
        Authenticate user with constant-time Argon2id verification.
        Returns (User, access_token, refresh_token).
        """
        stmt = select(User).where(User.email == payload.email)
        res = await db.execute(stmt)
        user = res.scalar_one_or_none()

        if not user or not verify_password(payload.password, user.hashed_password):
            # Generic error per security_guide.md §1 — never leak email existence
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive",
            )

        # Generate tokens
        access_token = create_access_token(user_id=str(user.id), role=user.role.value)
        refresh_token = create_refresh_token(user_id=str(user.id), role=user.role.value)

        # Record refresh token for revocation tracking
        token_payload = decode_token(refresh_token)
        refresh_record = RefreshToken(
            user_id=user.id,
            jti=token_payload.jti,
            expires_at=token_payload.exp,
        )
        db.add(refresh_record)
        await db.flush()

        return user, access_token, refresh_token

    @staticmethod
    async def refresh_session(
        db: AsyncSession, refresh_token: str
    ) -> Tuple[User, str, str]:
        """Validate refresh token and issue new rotating token pair."""
        token_payload = decode_token(refresh_token)
        if token_payload.type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )

        # Verify against database revocation list
        stmt = select(RefreshToken).where(
            RefreshToken.jti == token_payload.jti,
            RefreshToken.revoked_at.is_(None),
        )
        res = await db.execute(stmt)
        record = res.scalar_one_or_none()

        if not record or record.expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has been revoked or expired",
            )

        # Revoke the used refresh token (Token Rotation)
        record.revoked_at = datetime.now(timezone.utc)

        # Fetch user
        stmt_user = select(User).where(User.id == record.user_id)
        user_res = await db.execute(stmt_user)
        user = user_res.scalar_one_or_none()

        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account no longer active",
            )

        # Issue new token pair
        new_access = create_access_token(user_id=str(user.id), role=user.role.value)
        new_refresh = create_refresh_token(user_id=str(user.id), role=user.role.value)

        new_payload = decode_token(new_refresh)
        new_record = RefreshToken(
            user_id=user.id,
            jti=new_payload.jti,
            expires_at=new_payload.exp,
        )
        db.add(new_record)
        await db.flush()

        return user, new_access, new_refresh

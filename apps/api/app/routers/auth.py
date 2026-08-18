"""
WasteWise AI — Authentication Router
Endpoints for user registration, Argon2id authentication, token refresh, and profile inspection.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_user, TokenPayload
from app.schemas.all_schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    TokenResponse,
    UserRead,
)
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new citizen account."""
    user = await AuthService.register_citizen(db, payload)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticate user and return JWT access token.
    Sets httpOnly, Secure, SameSite=Strict refresh cookie per security_guide.md §1.
    """
    user, access_token, refresh_token = await AuthService.authenticate_user(db, payload)

    # Set rotating refresh token cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,  # Set to True in production HTTPS
        samesite="lax",
        max_age=7 * 24 * 3600,
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=15 * 60,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Exchange rotating refresh token cookie for new access & refresh tokens."""
    cookie_token = request.cookies.get("refresh_token")
    if not cookie_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token cookie",
        )

    user, new_access, new_refresh = await AuthService.refresh_session(db, cookie_token)

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 24 * 3600,
    )

    return TokenResponse(
        access_token=new_access,
        token_type="bearer",
        expires_in=15 * 60,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
    )


@router.get("/me", response_model=TokenPayload)
async def get_me(current_user: TokenPayload = Depends(get_current_user)):
    """Return currently authenticated user token payload."""
    return current_user

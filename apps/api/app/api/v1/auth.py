"""Auth endpoints (contracts §4.5). Stub-backed by fixtures/auth/user.json
(#38); real password hashing and session storage land in #152/#153.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from app.core.fixtures import load_fixture
from app.schemas.auth import LoginRequest, User, UserResponse
from app.schemas.common import UNAUTHORIZED_RESPONSE, ApiError

router = APIRouter(prefix="/auth", tags=["auth"])

SESSION_COOKIE_NAME = "session"
# Stub: presence/value proves a login happened, nothing more. Real,
# unguessable session tokens are #153's job.
_STUB_SESSION_VALUE = "stub-session"


def _seeded_user() -> User:
    return User.model_validate(load_fixture("auth/user.json"))


@router.post("/login", response_model=UserResponse, responses=UNAUTHORIZED_RESPONSE)
async def login(credentials: LoginRequest, response: Response) -> UserResponse:
    """Sprint 0: password check is a stub (contracts §4.5) — any password
    for the one seeded user succeeds; any other email is unauthorized."""
    user = _seeded_user()
    if credentials.email != user.email:
        raise ApiError("unauthorized", "Invalid email or password")

    response.set_cookie(SESSION_COOKIE_NAME, _STUB_SESSION_VALUE, httponly=True, samesite="lax")
    return UserResponse(user=user)


@router.post("/logout", status_code=204)
async def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME)


@router.get("/me", response_model=UserResponse, responses=UNAUTHORIZED_RESPONSE)
async def me(request: Request) -> UserResponse:
    if request.cookies.get(SESSION_COOKIE_NAME) != _STUB_SESSION_VALUE:
        raise ApiError("unauthorized", "Not authenticated")
    return UserResponse(user=_seeded_user())

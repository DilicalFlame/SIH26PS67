"""POST /auth/login, GET /auth/me (contracts §4.5)."""

from __future__ import annotations

from app.schemas.common import CamelModel


class LoginRequest(CamelModel):
    email: str
    password: str


class User(CamelModel):
    id: str
    email: str
    display_name: str


class UserResponse(CamelModel):
    user: User
